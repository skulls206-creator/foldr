import { Router, type IRouter, Request, Response } from "express";
import { db } from "@workspace/db";
import { folderSharesTable, foldersTable, filesTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

const router: IRouter = Router();

// Public endpoint — no auth required
router.get("/:token", async (req: Request, res: Response) => {
  const [share] = await db
    .select()
    .from(folderSharesTable)
    .where(eq(folderSharesTable.token, req.params.token as string))
    .limit(1);

  if (!share) {
    res.status(404).json({ error: "Shared folder not found" });
    return;
  }

  const [folder] = await db
    .select()
    .from(foldersTable)
    .where(eq(foldersTable.id, share.folderId))
    .limit(1);

  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }

  const files = await db
    .select()
    .from(filesTable)
    .where(and(
      eq(filesTable.folderId, folder.id),
      eq(filesTable.isDeleted, false)
    ));

  // Collect sub-folders
  const subFolders = await db
    .select()
    .from(foldersTable)
    .where(eq(foldersTable.parentId, folder.id));

  res.json({
    folder: {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId ?? null,
      createdAt: folder.createdAt.toISOString(),
    },
    files: files.map((f: typeof filesTable.$inferSelect) => ({
      id: f.id,
      name: f.name,
      size: Number(f.size),
      mimeType: f.mimeType,
      cid: f.cid,
      isEncrypted: f.isEncrypted,
      storageBackend: f.storageBackend,
      createdAt: f.createdAt.toISOString(),
    })),
    subFolders: subFolders.map((sf: typeof foldersTable.$inferSelect) => ({
      id: sf.id,
      name: sf.name,
      createdAt: sf.createdAt.toISOString(),
    })),
  });
});

export default router;
