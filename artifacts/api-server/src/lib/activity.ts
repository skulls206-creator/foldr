import { db, activityLogsTable } from "@workspace/db";

export async function logActivity(params: {
  userId: string;
  action: string;
  resourceType: "file" | "folder" | "system";
  resourceId?: string | null;
  resourceName?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  // Fire-and-forget — never block the main request
  db.insert(activityLogsTable)
    .values({
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      resourceName: params.resourceName ?? null,
      metadata: params.metadata ?? null,
    })
    .catch(() => {});
}
