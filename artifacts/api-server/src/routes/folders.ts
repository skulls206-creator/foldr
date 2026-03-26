import { Router, type IRouter, Request, Response } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { foldersTable, filesTable, folderSharesTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function toFolderResponse(f: typeof foldersTable.$inferSelect & { totalSize?: number | string | null }) {
  return {
    id: f.id,
    name: f.name,
    parentId: f.parentId ?? null,
    totalSize: Number(f.totalSize ?? 0),
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const folders = await db
    .select({
      id: foldersTable.id,
      name: foldersTable.name,
      userId: foldersTable.userId,
      parentId: foldersTable.parentId,
      createdAt: foldersTable.createdAt,
      updatedAt: foldersTable.updatedAt,
      totalSize: sql<number>`COALESCE(SUM(CASE WHEN ${filesTable.isDeleted} = false THEN ${filesTable.size} ELSE 0 END), 0)`,
    })
    .from(foldersTable)
    .leftJoin(filesTable, eq(filesTable.folderId, foldersTable.id))
    .where(eq(foldersTable.userId, req.userId!))
    .groupBy(
      foldersTable.id,
      foldersTable.name,
      foldersTable.userId,
      foldersTable.parentId,
      foldersTable.createdAt,
      foldersTable.updatedAt,
    );

  res.json({ folders: folders.map(toFolderResponse) });
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { name, parentId } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Folder name is required" });
    return;
  }

  const [folder] = await db
    .insert(foldersTable)
    .values({ userId: req.userId!, name: name.trim(), parentId: parentId ?? null })
    .returning();

  logActivity({
    userId: req.userId!,
    action: "create_folder",
    resourceType: "folder",
    resourceId: folder.id,
    resourceName: folder.name,
  });

  res.status(201).json(toFolderResponse(folder));
});

// ── Rename folder ─────────────────────────────────────────────────────────

router.patch("/:id/rename", requireAuth, async (req: Request, res: Response) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [folder] = await db
    .select()
    .from(foldersTable)
    .where(and(eq(foldersTable.id, req.params.id), eq(foldersTable.userId, req.userId!)))
    .limit(1);

  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }

  const [updated] = await db
    .update(foldersTable)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(foldersTable.id, folder.id))
    .returning();

  logActivity({
    userId: req.userId!,
    action: "rename",
    resourceType: "folder",
    resourceId: folder.id,
    resourceName: name.trim(),
    metadata: { oldName: folder.name },
  });

  res.json(toFolderResponse(updated));
});

// ── Folder share ─────────────────────────────────────────────────────────

router.post("/:id/share", requireAuth, async (req: Request, res: Response) => {
  const [folder] = await db
    .select()
    .from(foldersTable)
    .where(and(eq(foldersTable.id, req.params.id), eq(foldersTable.userId, req.userId!)))
    .limit(1);

  if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }

  // If share already exists, return it
  const existing = await db
    .select()
    .from(folderSharesTable)
    .where(and(eq(folderSharesTable.folderId, folder.id), eq(folderSharesTable.userId, req.userId!)))
    .limit(1);

  if (existing.length > 0) {
    res.json({
      id: existing[0].id,
      folderId: existing[0].folderId,
      token: existing[0].token,
      url: `/shared-folder/${existing[0].token}`,
      createdAt: existing[0].createdAt.toISOString(),
    });
    return;
  }

  const token = crypto.randomBytes(24).toString("hex");
  const [share] = await db
    .insert(folderSharesTable)
    .values({ folderId: folder.id, userId: req.userId!, token })
    .returning();

  logActivity({
    userId: req.userId!,
    action: "share_folder",
    resourceType: "folder",
    resourceId: folder.id,
    resourceName: folder.name,
  });

  res.status(201).json({
    id: share.id,
    folderId: share.folderId,
    token: share.token,
    url: `/shared-folder/${share.token}`,
    createdAt: share.createdAt.toISOString(),
  });
});

router.get("/:id/share", requireAuth, async (req: Request, res: Response) => {
  const [folder] = await db
    .select()
    .from(foldersTable)
    .where(and(eq(foldersTable.id, req.params.id), eq(foldersTable.userId, req.userId!)))
    .limit(1);

  if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }

  const [share] = await db
    .select()
    .from(folderSharesTable)
    .where(and(eq(folderSharesTable.folderId, folder.id), eq(folderSharesTable.userId, req.userId!)))
    .limit(1);

  if (!share) {
    res.json({ shared: false });
    return;
  }

  res.json({
    shared: true,
    id: share.id,
    folderId: share.folderId,
    token: share.token,
    url: `/shared-folder/${share.token}`,
    createdAt: share.createdAt.toISOString(),
  });
});

router.delete("/:id/share", requireAuth, async (req: Request, res: Response) => {
  await db
    .delete(folderSharesTable)
    .where(and(
      eq(folderSharesTable.folderId, req.params.id),
      eq(folderSharesTable.userId, req.userId!)
    ));

  res.json({ message: "Share link removed" });
});

// ── Bulk delete ─────────────────────────────────────────────────────────

router.post("/bulk-delete", requireAuth, async (req: Request, res: Response) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids array is required" });
    return;
  }
  await db
    .update(filesTable)
    .set({ folderId: null })
    .where(inArray(filesTable.folderId, ids));
  await db
    .delete(foldersTable)
    .where(and(eq(foldersTable.userId, req.userId!), inArray(foldersTable.id, ids)));
  res.json({ deleted: ids.length });
});

// ── Delete single folder ─────────────────────────────────────────────────

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const [folder] = await db
    .select()
    .from(foldersTable)
    .where(and(eq(foldersTable.id, req.params.id), eq(foldersTable.userId, req.userId!)))
    .limit(1);

  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }

  await db.update(filesTable).set({ folderId: null }).where(eq(filesTable.folderId, folder.id));
  await db.delete(foldersTable).where(eq(foldersTable.id, folder.id));

  logActivity({
    userId: req.userId!,
    action: "delete_folder",
    resourceType: "folder",
    resourceId: folder.id,
    resourceName: folder.name,
  });

  res.json({ message: "Folder deleted" });
});

export default router;
