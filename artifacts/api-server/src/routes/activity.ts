import { Router, type IRouter, Request, Response } from "express";
import { db, activityLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function toLogRow(log: typeof activityLogsTable.$inferSelect) {
  return {
    id: log.id,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    resourceName: log.resourceName,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));

  const logs = await db
    .select()
    .from(activityLogsTable)
    .where(eq(activityLogsTable.userId, req.userId!))
    .orderBy(desc(activityLogsTable.createdAt))
    .limit(limit);

  res.json({ activity: logs.map(toLogRow) });
});

router.get("/export", requireAuth, async (req: Request, res: Response) => {
  const logs = await db
    .select()
    .from(activityLogsTable)
    .where(eq(activityLogsTable.userId, req.userId!))
    .orderBy(desc(activityLogsTable.createdAt))
    .limit(10_000);

  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(typeof v === "object" ? JSON.stringify(v) : v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const header = ["Date", "Action", "Resource Type", "Resource Name", "Resource ID", "Details"];
  const rows = logs.map(log => [
    escape(log.createdAt.toISOString()),
    escape(log.action),
    escape(log.resourceType),
    escape(log.resourceName),
    escape(log.resourceId),
    escape(log.metadata ? JSON.stringify(log.metadata) : ""),
  ]);

  const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="foldr-activity-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

export default router;
