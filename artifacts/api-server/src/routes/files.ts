import { Router, type IRouter, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import archiver from "archiver";
import sharp from "sharp";
import { db } from "@workspace/db";
import { filesTable, shareLinksTable, fileVersionsTable, foldersTable } from "@workspace/db";
import { eq, and, desc, like, count, isNull, sum, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getAdapter } from "../lib/storage";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

function toFileResponse(file: typeof filesTable.$inferSelect) {
  return {
    id: file.id,
    userId: file.userId,
    folderId: file.folderId ?? null,
    name: file.name,
    size: Number(file.size),
    mimeType: file.mimeType,
    cid: file.cid,
    lighthouseFileId: file.lighthouseFileId ?? null,
    storageBackend: file.storageBackend,
    isEncrypted: file.isEncrypted,
    isDeleted: file.isDeleted,
    isStarred: file.isStarred,
    accessCondition: file.accessCondition ?? null,
    thumbnailCid: file.thumbnailCid ?? null,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

async function generateThumbnail(buffer: Buffer, mimeType: string): Promise<Buffer | null> {
  if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") return null;
  try {
    return await sharp(buffer)
      .resize(300, 300, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
  } catch {
    return null;
  }
}

// ── Upload ─────────────────────────────────────────────────────────────────

router.post("/upload", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  const STORAGE_LIMIT = 100 * 1024 * 1024;
  const encrypt = req.body.encrypt === "true" || req.body.encrypt === true;
  const folderId = req.body.folderId || null;
  const adapter = getAdapter();

  const [{ currentUsage }] = await db
    .select({ currentUsage: sum(filesTable.size) })
    .from(filesTable)
    .where(and(eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)));

  const usedBytes = Number(currentUsage ?? 0);
  if (usedBytes + file.size > STORAGE_LIMIT) {
    const remaining = Math.max(0, STORAGE_LIMIT - usedBytes);
    res.status(413).json({
      error: `Storage limit exceeded. You have ${remaining} bytes remaining (limit: 100 MB).`,
      usedBytes,
      limitBytes: STORAGE_LIMIT,
    });
    return;
  }

  try {
    let result;
    if (encrypt) {
      result = await adapter.uploadEncrypted(file.buffer, file.originalname, file.mimetype);
    } else {
      result = await adapter.uploadPlain(file.buffer, file.originalname, file.mimetype);
    }

    const [inserted] = await db
      .insert(filesTable)
      .values({
        userId: req.userId!,
        folderId: folderId ?? null,
        name: file.originalname,
        size: result.size,
        mimeType: file.mimetype,
        cid: result.cid,
        lighthouseFileId: result.lighthouseFileId ?? null,
        storageBackend: adapter.backend,
        isEncrypted: encrypt,
        isDeleted: false,
        isStarred: false,
      })
      .returning();

    // Record initial version
    await db.insert(fileVersionsTable).values({
      fileId: inserted.id,
      versionNumber: 1,
      cid: result.cid,
      size: result.size,
      storageBackend: adapter.backend,
    });

    // Generate thumbnail for non-encrypted images
    let finalFile = inserted;
    if (!encrypt) {
      const thumbBuffer = await generateThumbnail(file.buffer, file.mimetype);
      if (thumbBuffer) {
        try {
          const thumbResult = await adapter.uploadPlain(thumbBuffer, `thumb_${file.originalname}.jpg`, "image/jpeg");
          [finalFile] = await db
            .update(filesTable)
            .set({ thumbnailCid: thumbResult.cid })
            .where(eq(filesTable.id, inserted.id))
            .returning();
        } catch {
          // Thumbnail generation failed — not critical
        }
      }
    }

    logActivity({
      userId: req.userId!,
      action: "upload",
      resourceType: "file",
      resourceId: inserted.id,
      resourceName: inserted.name,
      metadata: { size: result.size, encrypted: encrypt },
    });

    res.status(201).json(toFileResponse(finalFile));
  } catch (err: any) {
    req.log.error({ err }, "Upload failed");
    res.status(500).json({ error: err.message ?? "Upload failed" });
  }
});

// ── Usage ─────────────────────────────────────────────────────────────────

router.get("/usage", requireAuth, async (req: Request, res: Response) => {
  const LIMIT_BYTES = 100 * 1024 * 1024;

  const [{ total }] = await db
    .select({ total: count() })
    .from(filesTable)
    .where(and(eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)));

  const [{ used }] = await db
    .select({ used: sum(filesTable.size) })
    .from(filesTable)
    .where(and(eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)));

  res.json({
    usedBytes: Number(used ?? 0),
    limitBytes: LIMIT_BYTES,
    fileCount: Number(total),
  });
});

// ── Trash listing ─────────────────────────────────────────────────────────

router.get("/trash", requireAuth, async (req: Request, res: Response) => {
  const files = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, true)))
    .orderBy(desc(filesTable.updatedAt));

  res.json({ files: files.map(toFileResponse) });
});

// ── Empty trash ─────────────────────────────────────────────────────────

router.delete("/trash", requireAuth, async (req: Request, res: Response) => {
  const trashedFiles = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, true)));

  for (const file of trashedFiles) {
    try { await getAdapter().deleteFile(file.cid); } catch {}
  }

  if (trashedFiles.length > 0) {
    await db
      .delete(filesTable)
      .where(and(eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, true)));
  }

  logActivity({
    userId: req.userId!,
    action: "empty_trash",
    resourceType: "system" as any,
    metadata: { count: trashedFiles.length },
  });

  res.json({ deleted: trashedFiles.length });
});

// ── Bulk operations ─────────────────────────────────────────────────────────

router.post("/bulk-delete", requireAuth, async (req: Request, res: Response) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids array is required" });
    return;
  }
  const files = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.userId, req.userId!), inArray(filesTable.id, ids), eq(filesTable.isDeleted, false)));

  for (const file of files) {
    await db.update(filesTable).set({ isDeleted: true, updatedAt: new Date() }).where(eq(filesTable.id, file.id));
    try { await getAdapter().deleteFile(file.cid); } catch {}
  }
  res.json({ deleted: files.length });
});

router.post("/bulk-star", requireAuth, async (req: Request, res: Response) => {
  const { ids, starred } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids array is required" });
    return;
  }
  const newStarred = starred === true || starred === "true";
  await db
    .update(filesTable)
    .set({ isStarred: newStarred, updatedAt: new Date() })
    .where(and(eq(filesTable.userId, req.userId!), inArray(filesTable.id, ids)));
  res.json({ starred: newStarred, count: ids.length });
});

router.post("/bulk-move", requireAuth, async (req: Request, res: Response) => {
  const { ids, folderId } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids array is required" });
    return;
  }
  await db
    .update(filesTable)
    .set({ folderId: folderId ?? null, updatedAt: new Date() })
    .where(and(eq(filesTable.userId, req.userId!), inArray(filesTable.id, ids)));
  res.json({ moved: ids.length, folderId: folderId ?? null });
});

// ── Bulk ZIP download ────────────────────────────────────────────────────────

router.post("/bulk-download", requireAuth, async (req: Request, res: Response) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids array is required" });
    return;
  }

  const files = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.userId, req.userId!), inArray(filesTable.id, ids), eq(filesTable.isDeleted, false)));

  if (files.length === 0) { res.status(404).json({ error: "No files found" }); return; }

  const adapter = getAdapter();
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="foldr-download-${Date.now()}.zip"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(res);

  for (const file of files) {
    try {
      let fileBuffer: Buffer;
      if (file.isEncrypted) {
        const rawKeyHex = await adapter.fetchEncryptionKey(file.lighthouseFileId ?? "");
        const rawKey = Buffer.from(rawKeyHex, "hex");
        const encryptedFile = await adapter.getFile(file.cid);
        if (!encryptedFile) continue;
        const payload = encryptedFile.body;
        const iv = payload.subarray(0, 12);
        const authTag = payload.subarray(12, 28);
        const ciphertext = payload.subarray(28);
        const decipher = crypto.createDecipheriv("aes-256-gcm", rawKey, iv);
        decipher.setAuthTag(authTag);
        fileBuffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      } else {
        const plainFile = await adapter.getFile(file.cid);
        if (!plainFile) continue;
        fileBuffer = plainFile.body;
      }
      archive.append(fileBuffer, { name: file.name });
    } catch {
      // Skip files that fail — include what we can
    }
  }

  await archive.finalize();
});

// ── List files ─────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const search = req.query.search ? String(req.query.search) : null;
  const starred = req.query.starred === "true";
  const folderId = req.query.folderId ? String(req.query.folderId) : null;
  const offset = (page - 1) * limit;

  const conditions: any[] = [eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)];
  if (search) conditions.push(like(filesTable.name, `%${search}%`));
  if (starred) conditions.push(eq(filesTable.isStarred, true));
  if (folderId === "root") {
    conditions.push(isNull(filesTable.folderId));
  } else if (folderId) {
    conditions.push(eq(filesTable.folderId, folderId));
  }

  const files = await db
    .select()
    .from(filesTable)
    .where(and(...conditions))
    .orderBy(desc(filesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(filesTable)
    .where(and(...conditions));

  res.json({
    files: files.map(toFileResponse),
    total: Number(total),
    page,
    limit,
  });
});

// ── Share link list + revoke (must be before /:id to avoid param collision) ───

// GET /api/files/share-links — all share links for this user's files
router.get("/share-links", requireAuth, async (req: Request, res: Response) => {
  const links = await db
    .select({ sl: shareLinksTable, file: filesTable })
    .from(shareLinksTable)
    .innerJoin(filesTable, eq(shareLinksTable.fileId, filesTable.id))
    .where(eq(filesTable.userId, req.userId!))
    .orderBy(desc(shareLinksTable.createdAt))
    .limit(200);

  res.json({
    shareLinks: links.map(({ sl, file }) => toShareLinkResponse(sl, file.name)),
  });
});

// DELETE /api/files/share-links/:linkId — revoke a share link
router.delete("/share-links/:linkId", requireAuth, async (req: Request, res: Response) => {
  const [sl] = await db
    .select({ sl: shareLinksTable, file: filesTable })
    .from(shareLinksTable)
    .innerJoin(filesTable, eq(shareLinksTable.fileId, filesTable.id))
    .where(and(eq(shareLinksTable.id, req.params.linkId), eq(filesTable.userId, req.userId!)))
    .limit(1);

  if (!sl) { res.status(404).json({ error: "Share link not found" }); return; }

  await db.delete(shareLinksTable).where(eq(shareLinksTable.id, req.params.linkId));

  logActivity({
    userId: req.userId!,
    action: "revoke_share_link",
    resourceType: "file",
    resourceId: sl.file.id,
    resourceName: sl.file.name,
  });

  res.json({ message: "Share link revoked" });
});

// ── Single file ─────────────────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.json(toFileResponse(file));
});

// ── Rename ─────────────────────────────────────────────────────────────────

router.patch("/:id/rename", requireAuth, async (req: Request, res: Response) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const [updated] = await db
    .update(filesTable)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(filesTable.id, file.id))
    .returning();

  logActivity({
    userId: req.userId!,
    action: "rename",
    resourceType: "file",
    resourceId: file.id,
    resourceName: name.trim(),
    metadata: { oldName: file.name },
  });

  res.json(toFileResponse(updated));
});

// ── Star ─────────────────────────────────────────────────────────────────

router.patch("/:id/star", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const [updated] = await db
    .update(filesTable)
    .set({ isStarred: !file.isStarred, updatedAt: new Date() })
    .where(eq(filesTable.id, file.id))
    .returning();

  logActivity({
    userId: req.userId!,
    action: updated.isStarred ? "star" : "unstar",
    resourceType: "file",
    resourceId: file.id,
    resourceName: file.name,
  });

  res.json(toFileResponse(updated));
});

// ── Move ─────────────────────────────────────────────────────────────────

router.patch("/:id/move", requireAuth, async (req: Request, res: Response) => {
  const { folderId } = req.body ?? {};
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const [updated] = await db
    .update(filesTable)
    .set({ folderId: folderId ?? null, updatedAt: new Date() })
    .where(eq(filesTable.id, file.id))
    .returning();

  logActivity({
    userId: req.userId!,
    action: "move",
    resourceType: "file",
    resourceId: file.id,
    resourceName: file.name,
    metadata: { toFolderId: folderId ?? null },
  });

  res.json(toFileResponse(updated));
});

// ── Restore from trash ─────────────────────────────────────────────────────

router.patch("/:id/restore", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, true)))
    .limit(1);

  if (!file) {
    res.status(404).json({ error: "File not found in trash" });
    return;
  }

  const [updated] = await db
    .update(filesTable)
    .set({ isDeleted: false, updatedAt: new Date() })
    .where(eq(filesTable.id, file.id))
    .returning();

  logActivity({
    userId: req.userId!,
    action: "restore",
    resourceType: "file",
    resourceId: file.id,
    resourceName: file.name,
  });

  res.json(toFileResponse(updated));
});

// ── Delete (soft) ─────────────────────────────────────────────────────────

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  await db
    .update(filesTable)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(filesTable.id, file.id));

  try {
    await getAdapter().deleteFile(file.cid);
  } catch (err: any) {
    req.log.warn({ err }, "R2 delete failed after soft-delete; continuing");
  }

  logActivity({
    userId: req.userId!,
    action: "delete",
    resourceType: "file",
    resourceId: file.id,
    resourceName: file.name,
  });

  res.json({ message: "File moved to trash" });
});

// ── Versions ─────────────────────────────────────────────────────────────

router.get("/:id/versions", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!)))
    .limit(1);

  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const versions = await db
    .select()
    .from(fileVersionsTable)
    .where(eq(fileVersionsTable.fileId, file.id))
    .orderBy(desc(fileVersionsTable.createdAt));

  res.json({
    versions: versions.map(v => ({
      id: v.id,
      fileId: v.fileId,
      versionNumber: v.versionNumber,
      cid: v.cid,
      size: Number(v.size),
      storageBackend: v.storageBackend,
      createdAt: v.createdAt.toISOString(),
    })),
  });
});

// ── Version restore ────────────────────────────────────────────────────────

router.post("/:id/versions/:versionId/restore", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) { res.status(404).json({ error: "File not found" }); return; }

  const [version] = await db
    .select()
    .from(fileVersionsTable)
    .where(and(eq(fileVersionsTable.id, req.params.versionId), eq(fileVersionsTable.fileId, file.id)))
    .limit(1);

  if (!version) { res.status(404).json({ error: "Version not found" }); return; }

  // Get current max version number
  const [maxVer] = await db
    .select({ max: sql<number>`max(${fileVersionsTable.versionNumber})` })
    .from(fileVersionsTable)
    .where(eq(fileVersionsTable.fileId, file.id));

  const newVersionNumber = (maxVer?.max ?? 0) + 1;

  // Insert a new version entry for the restore point
  await db.insert(fileVersionsTable).values({
    fileId: file.id,
    versionNumber: newVersionNumber,
    cid: version.cid,
    size: version.size,
    storageBackend: version.storageBackend,
  });

  // Update the main file record
  const [updatedFile] = await db
    .update(filesTable)
    .set({ cid: version.cid, size: version.size, updatedAt: new Date() })
    .where(eq(filesTable.id, file.id))
    .returning();

  logActivity({
    userId: req.userId!,
    action: "restore_version",
    resourceType: "file",
    resourceId: file.id,
    resourceName: file.name,
    metadata: { restoredVersionId: version.id, versionNumber: version.versionNumber },
  });

  res.json(toFileResponse(updatedFile));
});

// ── Share link ─────────────────────────────────────────────────────────────

router.post("/:id/share-link", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const { expiresInHours, expiresAt: expiresAtRaw, maxViews, label } = req.body ?? {};
  const token = crypto.randomBytes(32).toString("hex");

  let expiresAt: Date | null = null;
  if (expiresAtRaw) {
    expiresAt = new Date(expiresAtRaw);
  } else if (expiresInHours) {
    expiresAt = new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000);
  }

  const [shareLink] = await db
    .insert(shareLinksTable)
    .values({
      fileId: file.id,
      token,
      expiresAt: expiresAt ?? undefined,
      maxViews: maxViews ? Number(maxViews) : undefined,
      label: label?.trim() || undefined,
    })
    .returning();

  logActivity({
    userId: req.userId!,
    action: "create_share_link",
    resourceType: "file",
    resourceId: file.id,
    resourceName: file.name,
  });

  res.status(201).json(toShareLinkResponse(shareLink, file.name));
});

function toShareLinkResponse(sl: typeof shareLinksTable.$inferSelect, fileName?: string) {
  const basePublicUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.PUBLIC_URL ?? "");
  const prefix = process.env.REPLIT_DEV_DOMAIN ? "/foldr-storage" : "";
  return {
    id: sl.id,
    fileId: sl.fileId,
    fileName: fileName ?? null,
    token: sl.token,
    url: `${basePublicUrl}${prefix}/share/${sl.token}`,
    expiresAt: sl.expiresAt?.toISOString() ?? null,
    maxViews: sl.maxViews ?? null,
    viewCount: sl.viewCount,
    downloadCount: sl.downloadCount,
    label: sl.label ?? null,
    createdAt: sl.createdAt.toISOString(),
  };
}

// GET /api/files/:id/share-links — list all share links for a file
router.get("/:id/share-links", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!)))
    .limit(1);

  if (!file) { res.status(404).json({ error: "File not found" }); return; }

  const links = await db
    .select()
    .from(shareLinksTable)
    .where(eq(shareLinksTable.fileId, file.id))
    .orderBy(desc(shareLinksTable.createdAt));

  res.json({ shareLinks: links.map(sl => toShareLinkResponse(sl, file.name)) });
});

router.post("/:id/share-encrypted", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) { res.status(404).json({ error: "File not found" }); return; }
  if (!file.isEncrypted) { res.status(400).json({ error: "File is not encrypted" }); return; }

  const { recipientAddress } = req.body ?? {};
  if (!recipientAddress) { res.status(400).json({ error: "recipientAddress is required" }); return; }

  try {
    await getAdapter().shareFile(file.cid, [recipientAddress]);
    res.json({ message: `File shared with ${recipientAddress}` });
  } catch (err: any) {
    req.log.error({ err }, "shareFile failed");
    res.status(500).json({ error: err.message ?? "Failed to share file" });
  }
});

router.delete("/:id/revoke-access", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) { res.status(404).json({ error: "File not found" }); return; }
  if (!file.isEncrypted) { res.status(400).json({ error: "File is not encrypted" }); return; }

  const { revokeAddress } = req.body ?? {};
  if (!revokeAddress) { res.status(400).json({ error: "revokeAddress is required" }); return; }

  try {
    await getAdapter().revokeFileAccess(file.cid, [revokeAddress]);
    res.json({ message: `Access revoked from ${revokeAddress}` });
  } catch (err: any) {
    req.log.error({ err }, "revokeFileAccess failed");
    res.status(500).json({ error: err.message ?? "Failed to revoke access" });
  }
});

router.post("/:id/set-token-gate", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) { res.status(404).json({ error: "File not found" }); return; }
  if (!file.isEncrypted) { res.status(400).json({ error: "File is not encrypted" }); return; }

  const { conditions, aggregator } = req.body ?? {};
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
    res.status(400).json({ error: "conditions array is required" });
    return;
  }

  const normalizedConditions = conditions.map((c: any, i: number) => ({ id: c.id ?? i + 1, ...c }));

  try {
    await getAdapter().applyAccessCondition(file.cid, normalizedConditions, aggregator);
    await db
      .update(filesTable)
      .set({ accessCondition: normalizedConditions, updatedAt: new Date() })
      .where(eq(filesTable.id, file.id));
    res.json({ message: "Token gate applied successfully" });
  } catch (err: any) {
    req.log.error({ err }, "applyAccessCondition failed");
    res.status(500).json({ error: err.message ?? "Failed to set token gate" });
  }
});

// ── Download ─────────────────────────────────────────────────────────────

async function decryptAndSend(cid: string, mimeType: string, filename: string, packagedKey: string, res: Response) {
  const adapter = getAdapter();

  // 1. Decrypt the file-level encryption key
  const rawKeyHex = await adapter.fetchEncryptionKey(packagedKey);
  const rawKey = Buffer.from(rawKeyHex, "hex");

  // 2. Fetch encrypted payload from R2
  const encryptedFile = await adapter.getFile(cid);
  if (!encryptedFile) throw new Error("File not found in R2");
  const encryptedPayload = encryptedFile.body;

  // 3. Parse: iv(12) + authTag(16) + ciphertext
  const iv = encryptedPayload.subarray(0, 12);
  const authTag = encryptedPayload.subarray(12, 28);
  const ciphertext = encryptedPayload.subarray(28);

  // 4. Decrypt
  const decipher = crypto.createDecipheriv("aes-256-gcm", rawKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader("Content-Length", String(decrypted.length));
  res.send(decrypted);
}

// ── Thumbnail ───────────────────────────────────────────────────────────────

router.get("/:id/thumbnail", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file || !file.thumbnailCid) { res.status(404).json({ error: "Thumbnail not found" }); return; }

  try {
    const adapter = getAdapter();
    const fileData = await adapter.getFile(file.thumbnailCid);
    if (!fileData) { res.status(404).json({ error: "Thumbnail not found" }); return; }
    res.setHeader("Content-Type", fileData.contentType);
    res.setHeader("Content-Length", String(fileData.contentLength));
    res.send(fileData.body);
  } catch (err: any) {
    req.log.error({ err }, "Thumbnail proxy failed");
    res.status(500).json({ error: "Could not serve thumbnail" });
  }
});

router.get("/:id/download", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) { res.status(404).json({ error: "File not found" }); return; }

  logActivity({
    userId: req.userId!,
    action: "download",
    resourceType: "file",
    resourceId: file.id,
    resourceName: file.name,
  });

  if (file.isEncrypted) {
    try {
      await decryptAndSend(file.cid, file.mimeType, file.name, file.lighthouseFileId ?? "", res);
    } catch (err: any) {
      req.log.error({ err }, "Decryption failed");
      res.status(500).json({ error: err.message ?? "Decryption failed" });
    }
    return;
  }

  // Plain file: redirect to R2 public URL or proxy
  const adapter = getAdapter();
  try {
    res.redirect(302, adapter.downloadUrl(file.cid));
  } catch {
    const fileData = await adapter.getFile(file.cid);
    if (!fileData) { res.status(404).json({ error: "File not found" }); return; }
    res.setHeader("Content-Type", fileData.contentType);
    res.setHeader("Content-Length", String(fileData.contentLength));
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.send(fileData.body);
  }
});

router.get("/:id/decrypt", requireAuth, async (req: Request, res: Response) => {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, req.params.id), eq(filesTable.userId, req.userId!), eq(filesTable.isDeleted, false)))
    .limit(1);

  if (!file) { res.status(404).json({ error: "File not found" }); return; }
  if (!file.isEncrypted) { res.status(400).json({ error: "File is not encrypted" }); return; }

  try {
    await decryptAndSend(file.cid, file.mimeType, file.name, file.lighthouseFileId ?? "", res);
  } catch (err: any) {
    req.log.error({ err }, "Decryption failed");
    res.status(500).json({ error: err.message ?? "Decryption failed" });
  }
});

export default router;
