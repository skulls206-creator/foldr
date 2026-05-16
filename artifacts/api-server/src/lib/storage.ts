import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "crypto";
import { Readable } from "stream";
import { logger } from "./logger";

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
  downloadUrl(key: string): string;
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

  constructor(bucket: string, accountId: string, accessKeyId: string, secretAccessKey: string, publicUrl: string, masterKeyHex: string) {
    this.bucket = bucket;
    this.publicUrl = publicUrl.replace(/\/$/, "");
    this.masterKeyHex = masterKeyHex;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
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
    const encrypted = encryptBuffer(buffer, fileId, this.masterKeyHex);
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
    return decryptBuffer(encrypted, fileId, this.masterKeyHex);
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

  downloadUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }
}

let storageAdapter: StorageAdapter;

export function initStorageAdapter(): void {
  const bucket = process.env.R2_BUCKET_NAME;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicUrl = process.env.R2_PUBLIC_URL;
  const masterKeyHex = process.env.R2_ENCRYPTION_MASTER_KEY;

  if (!bucket) throw new Error("R2_BUCKET_NAME environment variable is required");
  if (!accountId) throw new Error("R2_ACCOUNT_ID environment variable is required");
  if (!accessKeyId) throw new Error("R2_ACCESS_KEY_ID environment variable is required");
  if (!secretAccessKey) throw new Error("R2_SECRET_ACCESS_KEY environment variable is required");
  if (!publicUrl) throw new Error("R2_PUBLIC_URL environment variable is required");
  if (!masterKeyHex) throw new Error("R2_ENCRYPTION_MASTER_KEY environment variable is required");
  if (masterKeyHex.length !== 64) throw new Error("R2_ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes)");
  if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) throw new Error("R2_ENCRYPTION_MASTER_KEY must contain only valid hex characters");

  logger.info({ bucket }, "Storage: using Cloudflare R2 adapter");
  storageAdapter = new R2StorageAdapter(bucket, accountId, accessKeyId, secretAccessKey, publicUrl, masterKeyHex);
}

export function getAdapter(): StorageAdapter {
  if (!storageAdapter) throw new Error("Storage adapter not initialized");
  return storageAdapter;
}

export function getBackend(): "r2" {
  return "r2";
}

export function getLegacyDownloadUrl(storageBackend: string, cid: string): string {
  if (storageBackend === "fallback") {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  return `https://gateway.lighthouse.storage/ipfs/${cid}`;
}
