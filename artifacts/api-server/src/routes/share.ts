import { Router, type IRouter, Request, Response } from "express";
import { db } from "@workspace/db";
import { filesTable, shareLinksTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getAdapter, getLegacyDownloadUrl } from "../lib/storage";

const router: IRouter = Router();

async function resolveShareLink(token: string, incrementView = false) {
  const [shareLink] = await db
    .select()
    .from(shareLinksTable)
    .where(eq(shareLinksTable.token, token))
    .limit(1);

  if (!shareLink) return { error: "Share link not found", status: 404 };
  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) return { error: "Share link has expired", status: 410 };
  if (shareLink.maxViews !== null && shareLink.viewCount >= shareLink.maxViews) {
    return { error: "This link has reached its maximum number of views", status: 410 };
  }

  if (incrementView) {
    await db
      .update(shareLinksTable)
      .set({ viewCount: sql`${shareLinksTable.viewCount} + 1` })
      .where(eq(shareLinksTable.id, shareLink.id));
  }

  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, shareLink.fileId), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) return { error: "File not found", status: 404 };

  return { shareLink, file };
}

router.get("/share/:token", async (req: Request, res: Response) => {
  const result = await resolveShareLink(req.params.token, true);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  const { shareLink, file } = result;
  const downloadUrl = file.isEncrypted
    ? `/api/share/${shareLink.token}/download`
    : file.storageBackend === "r2"
      ? await getAdapter().downloadUrl(file.cid)
      : getLegacyDownloadUrl(file.storageBackend, file.cid);

  res.json({
    file: {
      id: file.id,
      // Owner userId intentionally omitted — share recipients should not be
      // able to enumerate which user owns the file.
      name: file.name,
      size: Number(file.size),
      mimeType: file.mimeType,
      cid: file.cid,
      lighthouseFileId: file.lighthouseFileId ?? null,
      storageBackend: file.storageBackend,
      isEncrypted: file.isEncrypted,
      isDeleted: file.isDeleted,
      accessCondition: file.accessCondition ?? null,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    },
    shareLink: {
      id: shareLink.id,
      fileId: shareLink.fileId,
      token: shareLink.token,
      url: `/share/${shareLink.token}`,
      expiresAt: shareLink.expiresAt?.toISOString() ?? null,
      createdAt: shareLink.createdAt.toISOString(),
    },
    downloadUrl,
  });
});

// Download endpoint for share links — handles decryption server-side for encrypted files
router.get("/share/:token/download", async (req: Request, res: Response) => {
  const result = await resolveShareLink(req.params.token, false);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  const { file, shareLink } = result;

  // Track download count
  await db
    .update(shareLinksTable)
    .set({ downloadCount: sql`${shareLinksTable.downloadCount} + 1` })
    .where(eq(shareLinksTable.id, shareLink.id));

  if (file.isEncrypted) {
    if (file.storageBackend !== "r2") {
      res.status(400).json({ error: "Legacy IPFS-encrypted files cannot be decrypted with the new storage backend." });
      return;
    }
    try {
      const adapter = getAdapter();
      const decrypted = await adapter.downloadAndDecrypt(file.cid, file.id);

      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
      res.setHeader("Content-Length", String(decrypted.length));
      res.send(decrypted);
    } catch (err: any) {
      req.log.error({ err }, "Share decryption failed");
      res.status(500).json({ error: "Failed to decrypt file for download" });
    }
    return;
  }

  const redirectUrl = file.storageBackend === "r2"
    ? await getAdapter().downloadUrl(file.cid)
    : getLegacyDownloadUrl(file.storageBackend, file.cid);
  res.redirect(302, redirectUrl);
});

export default router;
