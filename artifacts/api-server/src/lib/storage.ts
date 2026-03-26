import lighthouse from "@lighthouse-web3/sdk";
import kavach from "@lighthouse-web3/kavach";
import { ethers } from "ethers";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import { logger } from "./logger";

export interface UploadResult {
  cid: string;
  name: string;
  size: number;
  lighthouseFileId?: string;
}

export interface StorageAdapter {
  backend: "lighthouse" | "fallback";
  uploadPlain(buffer: Buffer, filename: string, mimeType: string): Promise<UploadResult>;
  uploadEncrypted(buffer: Buffer, filename: string, mimeType: string): Promise<UploadResult>;
  deleteFile(lighthouseFileId: string | null | undefined): Promise<void>;
  shareFile(cid: string, recipientAddresses: string[]): Promise<void>;
  revokeFileAccess(cid: string, revokeAddresses: string[]): Promise<void>;
  applyAccessCondition(cid: string, conditions: any[], aggregator?: string): Promise<void>;
  fetchEncryptionKey(cid: string): Promise<string>;
  downloadUrl(cid: string): string;
}

async function getKavachJWT(): Promise<string> {
  const privateKey = process.env.ETH_PRIVATE_KEY!;
  const wallet = new ethers.Wallet(privateKey);
  const authMessage = await kavach.getAuthMessage(wallet.address);
  const signedMessage = await wallet.signMessage(authMessage.message);
  const result = await kavach.getJWT(wallet.address, signedMessage);
  if (!result.JWT) throw new Error("Failed to get Kavach JWT");
  return result.JWT;
}

function getWalletAddress(): string {
  return new ethers.Wallet(process.env.ETH_PRIVATE_KEY!).address;
}

async function getLighthouseFileId(apiKey: string, cid: string): Promise<string | undefined> {
  try {
    const response = await lighthouse.getUploads(apiKey, null);
    const files = response.data?.fileList ?? [];
    const match = files.find((f: any) => f.cid === cid);
    return match?.id;
  } catch {
    return undefined;
  }
}

class LighthouseStorageAdapter implements StorageAdapter {
  backend = "lighthouse" as const;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async uploadPlain(buffer: Buffer, filename: string): Promise<UploadResult> {
    const response = await lighthouse.uploadBuffer(buffer, this.apiKey);
    const data = response.data;
    const cid: string = data.Hash;
    const name: string = data.Name;
    const size = parseInt(data.Size, 10) || buffer.length;
    const lighthouseFileId = await getLighthouseFileId(this.apiKey, cid);
    return { cid, name, size, lighthouseFileId };
  }

  async uploadEncrypted(buffer: Buffer, filename: string): Promise<UploadResult> {
    const tmpDir = os.tmpdir();
    const tempName = crypto.randomBytes(16).toString("hex") + "-" + filename;
    const tempPath = path.join(tmpDir, tempName);
    try {
      await fs.writeFile(tempPath, buffer);
      const jwt = await getKavachJWT();
      const walletAddress = getWalletAddress();
      const response = await lighthouse.uploadEncrypted(tempPath, this.apiKey, walletAddress, jwt);
      const fileData = response.data[0];
      const cid: string = fileData.Hash;
      const name: string = fileData.Name;
      const size = parseInt(fileData.Size, 10) || buffer.length;
      const lighthouseFileId = await getLighthouseFileId(this.apiKey, cid);
      return { cid, name, size, lighthouseFileId };
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  async deleteFile(lighthouseFileId: string | null | undefined): Promise<void> {
    if (!lighthouseFileId) {
      logger.warn("deleteFile: no lighthouseFileId, skipping Lighthouse deletion");
      return;
    }
    await lighthouse.deleteFile(this.apiKey, lighthouseFileId);
  }

  async shareFile(cid: string, recipientAddresses: string[]): Promise<void> {
    const jwt = await getKavachJWT();
    const walletAddress = getWalletAddress();
    await lighthouse.shareFile(walletAddress, recipientAddresses, cid, jwt);
  }

  async revokeFileAccess(cid: string, revokeAddresses: string[]): Promise<void> {
    const jwt = await getKavachJWT();
    const walletAddress = getWalletAddress();
    await lighthouse.revokeFileAccess(walletAddress, revokeAddresses, cid, jwt);
  }

  async applyAccessCondition(cid: string, conditions: any[], aggregator?: string): Promise<void> {
    const jwt = await getKavachJWT();
    const walletAddress = getWalletAddress();
    await lighthouse.applyAccessCondition(walletAddress, cid, jwt, conditions, aggregator);
  }

  async fetchEncryptionKey(cid: string): Promise<string> {
    const jwt = await getKavachJWT();
    const walletAddress = getWalletAddress();
    const response = await lighthouse.fetchEncryptionKey(cid, walletAddress, jwt);
    if (!response.data.key) throw new Error("Failed to fetch encryption key");
    return response.data.key;
  }

  downloadUrl(cid: string): string {
    return `https://gateway.lighthouse.storage/ipfs/${cid}`;
  }
}

class FallbackIpfsAdapter implements StorageAdapter {
  backend = "fallback" as const;
  private pinataJwt: string;

  constructor(pinataJwt: string) {
    this.pinataJwt = pinataJwt;
  }

  async uploadPlain(buffer: Buffer, filename: string, mimeType: string): Promise<UploadResult> {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    formData.append("file", blob, filename);

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.pinataJwt}` },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Pinata upload failed: ${response.statusText}`);
    }
    const data: any = await response.json();
    return {
      cid: data.IpfsHash,
      name: filename,
      size: buffer.length,
      lighthouseFileId: undefined,
    };
  }

  async uploadEncrypted(): Promise<UploadResult> {
    throw new Error("Pinata fallback does not support encrypted uploads");
  }

  async deleteFile(): Promise<void> {
    logger.warn("Pinata fallback: cannot delete files from IPFS");
  }

  async shareFile(): Promise<void> {
    throw new Error("Pinata fallback does not support Kavach encryption operations");
  }

  async revokeFileAccess(): Promise<void> {
    throw new Error("Pinata fallback does not support Kavach encryption operations");
  }

  async applyAccessCondition(): Promise<void> {
    throw new Error("Pinata fallback does not support Kavach encryption operations");
  }

  async fetchEncryptionKey(): Promise<string> {
    throw new Error("Pinata fallback does not support Kavach encryption operations");
  }

  downloadUrl(cid: string): string {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
}

let storageAdapter: StorageAdapter;

export function initStorageAdapter(): void {
  const lighthouseApiKey = process.env.LIGHTHOUSE_API_KEY;
  const pinataJwt = process.env.PINATA_JWT;

  if (lighthouseApiKey) {
    logger.info("Storage: using Lighthouse adapter");
    storageAdapter = new LighthouseStorageAdapter(lighthouseApiKey);
  } else if (pinataJwt) {
    logger.warn("LIGHTHOUSE_API_KEY not set, falling back to Pinata");
    storageAdapter = new FallbackIpfsAdapter(pinataJwt);
  } else {
    logger.error("Neither LIGHTHOUSE_API_KEY nor PINATA_JWT set — uploads will fail");
    storageAdapter = new FallbackIpfsAdapter("");
  }
}

export function getAdapter(): StorageAdapter {
  if (!storageAdapter) throw new Error("Storage adapter not initialized");
  return storageAdapter;
}

export function getBackend(): "lighthouse" | "fallback" {
  return storageAdapter?.backend ?? "fallback";
}
