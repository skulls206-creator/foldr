import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "crypto";
import { logger } from "./logger";

export interface UploadResult {
  cid: string;
  name: string;
  size: number;
  lighthouseFileId?: string;
}

export interface StorageAdapter {
  backend: "r2";
  uploadPlain(buffer: Buffer, filename: string, mimeType: string): Promise<UploadResult>;
  uploadEncrypted(buffer: Buffer, filename: string, mimeType: string): Promise<UploadResult>;
  deleteFile(key: string | null | undefined): Promise<void>;
  shareFile(key: string, recipientAddress: string): Promise<void>;
  revokeFileAccess(key: string, revokeAddress: string): Promise<void>;
  applyAccessCondition(key: string, conditions: any[], aggregator?: string): Promise<void>;
  fetchEncryptionKey(key: string): Promise<string>;
  downloadUrl(key: string): string;
}

// ── Master key for encrypting file-level encryption keys ────────────────
// Stored in env var; if not set, files can still be encrypted but the key
// won't be stored safely.  In production, rotate and set this to a long
// random hex string (64+ hex chars).
const MASTER_KEY_HEX = process.env.R2_MASTER_KEY;
const MASTER_KEY = MASTER_KEY_HEX
  ? Buffer.from(MASTER_KEY_HEX, "hex")
  : null;

function deriveFileKey(fileKey: Buffer): Buffer {
  // Derive a 256-bit key from the master key + file-specific entropy
  // using HKDF-like construction (SHA-256 based)
  if (!MASTER_KEY) throw new Error("R2_MASTER_KEY not set — cannot encrypt/decrypt file keys");
  return crypto.createHmac("sha256", MASTER_KEY).update(fileKey).digest();
}

function encryptFileKey(rawKey: Buffer): string {
  // Encrypt a file-level AES key with the master key via AES-256-GCM
  const iv = crypto.randomBytes(12);
  const keyEncKey = deriveFileKey(iv);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyEncKey, iv);
  const encrypted = Buffer.concat([cipher.update(rawKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptFileKey(packaged: string): Buffer {
  const parts = packaged.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted key format");
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const keyEncKey = deriveFileKey(iv);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyEncKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// ── R2 storage backend ─────────────────────────────────────────────────

class R2StorageAdapter implements StorageAdapter {
  backend = "r2" as const;
  client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;

    if (!endpoint) throw new Error("R2_ENDPOINT is required");
    if (!accessKeyId) throw new Error("R2_ACCESS_KEY_ID is required");
    if (!secretAccessKey) throw new Error("R2_SECRET_ACCESS_KEY is required");
    if (!bucket) throw new Error("R2_BUCKET is required");

    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      requestHandler: {
        requestTimeout: 30_000,
      },
    });
    this.bucket = bucket;
    // Public URL for direct reads (optional — when R2 is set to public)
    this.publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  }

  async uploadPlain(
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<UploadResult> {
    const key = `${crypto.randomUUID()}--${filename}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    logger.info({ key, size: buffer.length }, "R2: uploaded plain file");
    return { cid: key, name: filename, size: buffer.length };
  }

  async uploadEncrypted(
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<UploadResult> {
    // 1. Generate a random file-level AES-256 key
    const fileKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    // 2. Encrypt the buffer with AES-256-GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", fileKey, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // 3. Store: iv(12) + authTag(16) + ciphertext
    const payload = Buffer.concat([iv, authTag, encrypted]);

    // 4. Upload ciphertext to R2
    const key = `enc-${crypto.randomUUID()}--${filename}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: payload,
        ContentType: "application/octet-stream",
      }),
    );

    // 5. Package the file key for DB storage (encrypted with master key)
    const packagedKey = encryptFileKey(fileKey);

    logger.info({ key, size: payload.length }, "R2: uploaded encrypted file");
    return { cid: key, name: filename, size: buffer.length, lighthouseFileId: packagedKey };
  }

  async deleteFile(key: string | null | undefined): Promise<void> {
    if (!key) {
      logger.warn("deleteFile: no key provided, skipping R2 deletion");
      return;
    }
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      logger.info({ key }, "R2: deleted file");
    } catch (err: any) {
      logger.warn({ err, key }, "R2: delete failed (non-fatal)");
    }
  }

  async shareFile(key: string, recipientAddress: string): Promise<void> {
    // With R2 + server-side key storage, sharing requires granting the
    // recipient access to the file's encryption key in the DB.
    // The frontend route calls this only for encrypted files.
    // We just store the intent in the accessCondition field (see route).
    // For a real shared-key system you'd store recipient+key in a separate
    // table and let the recipient retrieve the encrypted key.
    throw new Error(
      "Encrypted-file sharing with external wallets not available with R2. " +
      "Use share links for unencrypted files or share via account-level access.",
    );
  }

  async revokeFileAccess(key: string, revokeAddress: string): Promise<void> {
    throw new Error(
      "Wallet-based revoke not available with R2. Manage file access via the dashboard.",
    );
  }

  async applyAccessCondition(
    key: string,
    conditions: any[],
    aggregator?: string,
  ): Promise<void> {
    throw new Error(
      "Token-gating is not available with R2. Access conditions are managed server-side.",
    );
  }

  async fetchEncryptionKey(key: string): Promise<string> {
    // The caller passes the packaged encryption key (stored in
    // lighthouseFileId column — repurposed for R2 encrypted key storage).
    // We return the raw 32-byte key so the caller can decrypt.
    // NOTE: This is called with `file.lighthouseFileId` as `key` from the
    // decryptAndSend function.  We stored the packaged key there.
    return decryptFileKey(key).toString("hex");
  }

  downloadUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    throw new Error(
      "Direct download URLs are not available without R2_PUBLIC_URL. " +
      "The server will proxy file content instead.",
    );
  }

  /**
   * Fetch a file's raw bytes from R2 by object key.
   * Returns { body, contentType, contentLength } or null if not found.
   */
  async getFile(key: string): Promise<{
    body: Buffer;
    contentType: string;
    contentLength: number;
  } | null> {
    try {
      const getCmd = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const { Body, ContentType, ContentLength } = await this.client.send(getCmd);
      if (!Body) return null;
      const body = Buffer.from(
        await new Response(Body as ReadableStream).arrayBuffer(),
      );
      return {
        body,
        contentType: ContentType || "application/octet-stream",
        contentLength: Number(ContentLength ?? body.length),
      };
    } catch {
      return null;
    }
  }
}

// ── Adapter singleton ─────────────────────────────────────────────────

let storageAdapter: R2StorageAdapter;

/**
 * Called once at server startup.  Throws if the required R2 env vars
 * are missing so the server fails fast instead of letting uploads fail.
 */
export function initStorageAdapter(): void {
  logger.info("Storage: initializing Cloudflare R2 adapter");
  storageAdapter = new R2StorageAdapter();
  logger.info("Storage: R2 adapter ready");
}

export function getAdapter(): R2StorageAdapter {
  if (!storageAdapter) throw new Error("Storage adapter not initialized (call initStorageAdapter first)");
  return storageAdapter;
}

export function getBackend(): "r2" {
  return storageAdapter?.backend ?? "r2";
}
