import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { Readable } from "stream";
import { logger } from "./logger";

// Key rotation support:
// - R2_ENCRYPTION_MASTER_KEY: current active key for encrypting NEW files.
// - R2_NEW_MASTER_KEY (optional): when set, files are lazily re-encrypted
//   on access (download/decrypt) from the old key to the new key.
// - R2_PREVIOUS_MASTER_KEYS (optional): comma-separated hex keys used to
//   decrypt files still encrypted with older keys. This lets you rotate
//   keys multiple times without losing access to old files.

// Presigned R2 download URLs expire after 15 minutes. This caps the window of
// exposure if a URL leaks (e.g. via logs, browser history, referrer headers).
export const PRESIGNED_URL_TTL_SECONDS = 15 * 60;

export interface UploadResult {
  cid: string;
  name: string;
  size: number;
  lighthouseFileId?: undefined;
}

export interface StorageAdapter {
  backend: "r2";
  uploadPlain(buffer: Buffer, filename: string, mimeType: string): Promise<UploadResult>;
  uploadEncrypted(buffer: Buffer, filename: string, mimeType: string, fileId: string): Promise<UploadResult>;
  downloadAndDecrypt(key: string, fileId: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  shareFile(cid: string, recipientAddresses: string[]): Promise<void>;
  revokeFileAccess(cid: string, revokeAddresses: string[]): Promise<void>;
  applyAccessCondition(cid: string, conditions: any[], aggregator?: string): Promise<void>;
  downloadUrl(key: string): Promise<string>;
}

async function streamToBuffer(stream: Readable | ReadableStream): Promise<Buffer> {
  if (stream instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

function deriveFileKey(masterKeyHex: string, fileId: string): Buffer {
  const masterKey = Buffer.from(masterKeyHex, "hex");
  return Buffer.from(
    crypto.hkdfSync("sha256", masterKey, Buffer.from(fileId, "utf8"), "r2-file-encryption-v1", 32)
  );
}

function encryptBuffer(buffer: Buffer, fileId: string, masterKeyHex: string): Buffer {
  const key = deriveFileKey(masterKeyHex, fileId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

function decryptBuffer(encrypted: Buffer, fileId: string, masterKeyHex: string): Buffer {
  const key = deriveFileKey(masterKeyHex, fileId);
  const iv = encrypted.subarray(0, 12);
  const authTag = encrypted.subarray(12, 28);
  const ciphertext = encrypted.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

class R2StorageAdapter implements StorageAdapter {
  backend = "r2" as const;
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;
  private masterKeyHex: string;
  private newMasterKeyHex: string | null;
  private previousMasterKeys: string[];

  constructor(bucket: string, accountId: string, accessKeyId: string, secretAccessKey: string, publicUrl: string, masterKeyHex: string, newMasterKeyHex: string | null, previousMasterKeys: string[]) {
    this.bucket = bucket;
    this.publicUrl = publicUrl.replace(/\/$/, "");
    this.masterKeyHex = masterKeyHex;
    this.newMasterKeyHex = newMasterKeyHex;
    this.previousMasterKeys = previousMasterKeys;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  /**
   * Given a fileId, determines which master key to use for decryption.
   * Tries the current master key first, then the new master key (if different),
   * then all previous master keys.
   * Returns the key that successfully decrypts, or null if none work.
   */
  private resolveDecryptionKey(encrypted: Buffer, fileId: string): { keyHex: string; isOldKey: boolean } | null {
    const candidates = [this.masterKeyHex];
    if (this.newMasterKeyHex && this.newMasterKeyHex !== this.masterKeyHex) {
      candidates.push(this.newMasterKeyHex);
    }
    for (const oldKey of this.previousMasterKeys) {
      if (!candidates.includes(oldKey)) {
        candidates.push(oldKey);
      }
    }

    for (const keyHex of candidates) {
      try {
        const key = deriveFileKey(keyHex, fileId);
        const iv = encrypted.subarray(0, 12);
        const authTag = encrypted.subarray(12, 28);
        const ciphertext = encrypted.subarray(28);
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);
        decipher.update(ciphertext);
        decipher.final();
        // If we got here without throwing, the key is correct
        return { keyHex, isOldKey: keyHex !== this.masterKeyHex };
      } catch {
        // Wrong key — try the next candidate
      }
    }
    return null;
  }

  /**
   * Attempts to re-encrypt a file's ciphertext from an old key to the current
   * master key. If no new key is configured or the file is already using the
   * current key, this is a no-op.
   */
  private async maybeReEncrypt(key: string, fileId: string, encrypted: Buffer): Promise<Buffer> {
    if (!this.newMasterKeyHex) {
      // No rotation in progress — just decrypt normally
      return decryptBuffer(encrypted, fileId, this.masterKeyHex);
    }

    // Find which key can decrypt this file
    const resolved = this.resolveDecryptionKey(encrypted, fileId);
    if (!resolved) {
      throw new Error("Unable to decrypt file with any known master key");
    }

    // Decrypt with whatever key works
    const decrypted = decryptBuffer(encrypted, fileId, resolved.keyHex);

    // If the file was encrypted with an old key, re-encrypt with the new
    // master key and write back to R2
    if (resolved.isOldKey) {
      const newEncrypted = encryptBuffer(decrypted, fileId, this.newMasterKeyHex);
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: newEncrypted,
          ContentType: "application/octet-stream",
          ContentLength: newEncrypted.length,
        }),
      );
      logger.info({ fileId }, "Lazily re-encrypted file with new master key");
      // Return decrypted content to the caller
    }

    return decrypted;
  }

  async uploadPlain(buffer: Buffer, filename: string, mimeType: string): Promise<UploadResult> {
    const key = `files/${crypto.randomUUID()}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
      })
    );
    return { cid: key, name: filename, size: buffer.length };
  }

  async uploadEncrypted(buffer: Buffer, filename: string, _mimeType: string, fileId: string): Promise<UploadResult> {
    // Always encrypt new files with the latest master key
    const activeKey = this.newMasterKeyHex ?? this.masterKeyHex;
    const encrypted = encryptBuffer(buffer, fileId, activeKey);
    const key = `encrypted/${fileId}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: encrypted,
        ContentType: "application/octet-stream",
        ContentLength: encrypted.length,
      })
    );
    return { cid: key, name: filename, size: buffer.length };
  }

  async downloadAndDecrypt(key: string, fileId: string): Promise<Buffer> {
    const resp = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    if (!resp.Body) throw new Error("Empty response body from R2");
    const encrypted = await streamToBuffer(resp.Body as Readable);
    // Lazy re-encryption: if a new master key is configured, re-encrypt on access
    return this.maybeReEncrypt(key, fileId, encrypted);
  }

  async deleteFile(key: string): Promise<void> {
    if (!key) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async shareFile(_cid: string, _recipientAddresses: string[]): Promise<void> {
    logger.warn("shareFile: not supported for R2 backend — no-op");
  }

  async revokeFileAccess(_cid: string, _revokeAddresses: string[]): Promise<void> {
    logger.warn("revokeFileAccess: not supported for R2 backend — no-op");
  }

  async applyAccessCondition(_cid: string, _conditions: any[], _aggregator?: string): Promise<void> {
    logger.warn("applyAccessCondition: not supported for R2 backend — no-op");
  }

  async downloadUrl(key: string): Promise<string> {
    // Generate a short-lived presigned GET URL instead of a permanent public
    // URL. Even if the R2 bucket has a public hostname, we route downloads
    // through presigned URLs so access can be time-boxed.
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: PRESIGNED_URL_TTL_SECONDS },
    );
  }
}

let storageAdapter: StorageAdapter;

function validateHexKey(key: string | undefined | null, name: string, required: true): string;
function validateHexKey(key: string | undefined | null, name: string, required: false): string | null;
function validateHexKey(key: string | undefined | null, name: string, required: boolean): string | null {
  if (!key) {
    if (required) throw new Error(`${name} environment variable is required`);
    return null;
  }
  if (key.length !== 64) throw new Error(`${name} must be a 64-character hex string (32 bytes)`);
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${name} must contain only valid hex characters`);
  return key;
}

export function initStorageAdapter(): void {
  const bucket = process.env.R2_BUCKET_NAME;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicUrl = process.env.R2_PUBLIC_URL;
  const masterKeyHex = process.env.R2_ENCRYPTION_MASTER_KEY;
  const newMasterKeyHex = process.env.R2_NEW_MASTER_KEY ?? null;
  const previousMasterKeysRaw = process.env.R2_PREVIOUS_MASTER_KEYS ?? "";

  if (!bucket) throw new Error("R2_BUCKET_NAME environment variable is required");
  if (!accountId) throw new Error("R2_ACCOUNT_ID environment variable is required");
  if (!accessKeyId) throw new Error("R2_ACCESS_KEY_ID environment variable is required");
  if (!secretAccessKey) throw new Error("R2_SECRET_ACCESS_KEY environment variable is required");
  if (!publicUrl) throw new Error("R2_PUBLIC_URL environment variable is required");

  const validatedMasterKey = validateHexKey(masterKeyHex, "R2_ENCRYPTION_MASTER_KEY", true);
  const validatedNewKey = validateHexKey(newMasterKeyHex, "R2_NEW_MASTER_KEY", false);

  const previousMasterKeys: string[] = [];
  if (previousMasterKeysRaw) {
    for (const rawKey of previousMasterKeysRaw.split(",")) {
      const trimmed = rawKey.trim();
      if (trimmed) {
        previousMasterKeys.push(validateHexKey(trimmed, `R2_PREVIOUS_MASTER_KEYS entry`, true)!);
      }
    }
  }

  logger.info(
    {
      bucket,
      hasNewKey: !!validatedNewKey,
      previousKeyCount: previousMasterKeys.length,
    },
    "Storage: using Cloudflare R2 adapter",
  );
  storageAdapter = new R2StorageAdapter(bucket, accountId, accessKeyId, secretAccessKey, publicUrl, validatedMasterKey, validatedNewKey, previousMasterKeys);
}

export function getAdapter(): StorageAdapter {
  if (!storageAdapter) throw new Error("Storage adapter not initialized");
  return storageAdapter;
}

export function getBackend(): "r2" {
  return "r2";
}

/**
 * Resolve a download URL for a non-R2 storage backend.
 *
 * For the "fallback" backend, the URL comes from LEGACY_IPFS_GATEWAY_TEMPLATE
 * (defaults to `https://gateway.pinata.cloud/ipfs/${cid}`).
 * For the "lighthouse" backend, the URL comes from LIGHTHOUSE_GATEWAY_TEMPLATE
 * (defaults to `https://gateway.lighthouse.storage/ipfs/${cid}`).
 *
 * Unknown backends throw an error rather than silently routing to a third-party
 * gateway. This prevents accidental data exposure through unvetted fallback
 * URLs.
 */
export function getLegacyDownloadUrl(storageBackend: string, cid: string): string {
  if (storageBackend === "fallback") {
    const template = process.env.LEGACY_IPFS_GATEWAY_TEMPLATE
      ?? `https://gateway.pinata.cloud/ipfs/${cid}`;
    return template.replace(/\(cid\)/g, cid).replaceAll("${cid}", cid);
  }
  if (storageBackend === "lighthouse") {
    const template = process.env.LIGHTHOUSE_GATEWAY_TEMPLATE
      ?? `https://gateway.lighthouse.storage/ipfs/${cid}`;
    return template.replace(/\(cid\)/g, cid).replaceAll("${cid}", cid);
  }
  throw new Error(`Unknown storage backend "${storageBackend}" — no download URL available`);
}
