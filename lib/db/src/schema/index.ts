import {
  pgTable,
  text,
  boolean,
  bigint,
  integer,
  timestamp,
  uuid,
  jsonb,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { relations } from "drizzle-orm";

export const storageBackendEnum = pgEnum("storage_backend", [
  "lighthouse",
  "fallback",
]);

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  walletAddress: text("wallet_address"),
  timezone: text("timezone"),
  tokenVersion: integer("token_version").notNull().default(0),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("users_email_unique").on(t.email),
]);

export const foldersTable = pgTable("folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const filesTable = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => foldersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  mimeType: text("mime_type").notNull(),
  cid: text("cid").notNull(),
  lighthouseFileId: text("lighthouse_file_id"),
  storageBackend: storageBackendEnum("storage_backend").notNull(),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  isStarred: boolean("is_starred").notNull().default(false),
  accessCondition: jsonb("access_condition"),
  thumbnailCid: text("thumbnail_cid"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shareLinksTable = pgTable("share_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileId: uuid("file_id")
    .notNull()
    .references(() => filesTable.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at"),
  maxViews: integer("max_views"),
  viewCount: integer("view_count").notNull().default(0),
  downloadCount: integer("download_count").notNull().default(0),
  label: text("label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("share_links_token_unique").on(t.token),
]);

export const folderSharesTable = pgTable("folder_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  folderId: uuid("folder_id")
    .notNull()
    .references(() => foldersTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("folder_shares_token_unique").on(t.token),
]);

export const activityLogsTable = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: uuid("resource_id"),
  resourceName: text("resource_name"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userSessionsTable = pgTable("user_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});

export const fileVersionsTable = pgTable("file_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileId: uuid("file_id")
    .notNull()
    .references(() => filesTable.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull().default(1),
  cid: text("cid").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  storageBackend: storageBackendEnum("storage_backend").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(usersTable, ({ many }) => ({
  files: many(filesTable),
  folders: many(foldersTable),
  activityLogs: many(activityLogsTable),
  folderShares: many(folderSharesTable),
  sessions: many(userSessionsTable),
}));

export const foldersRelations = relations(foldersTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [foldersTable.userId],
    references: [usersTable.id],
  }),
  files: many(filesTable),
  shares: many(folderSharesTable),
}));

export const filesRelations = relations(filesTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [filesTable.userId],
    references: [usersTable.id],
  }),
  folder: one(foldersTable, {
    fields: [filesTable.folderId],
    references: [foldersTable.id],
  }),
  shareLinks: many(shareLinksTable),
  versions: many(fileVersionsTable),
}));

export const shareLinksRelations = relations(shareLinksTable, ({ one }) => ({
  file: one(filesTable, {
    fields: [shareLinksTable.fileId],
    references: [filesTable.id],
  }),
}));

export const folderSharesRelations = relations(folderSharesTable, ({ one }) => ({
  folder: one(foldersTable, {
    fields: [folderSharesTable.folderId],
    references: [foldersTable.id],
  }),
  user: one(usersTable, {
    fields: [folderSharesTable.userId],
    references: [usersTable.id],
  }),
}));

export const activityLogsRelations = relations(activityLogsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [activityLogsTable.userId],
    references: [usersTable.id],
  }),
}));

export const fileVersionsRelations = relations(fileVersionsTable, ({ one }) => ({
  file: one(filesTable, {
    fields: [fileVersionsTable.fileId],
    references: [filesTable.id],
  }),
}));

export const userSessionsRelations = relations(userSessionsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [userSessionsTable.userId],
    references: [usersTable.id],
  }),
}));

// ── Insert/Select schemas ─────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertFileSchema = createInsertSchema(filesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertShareLinkSchema = createInsertSchema(shareLinksTable).omit({
  id: true,
  createdAt: true,
});
export const insertFolderSchema = createInsertSchema(foldersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertFolderShareSchema = createInsertSchema(folderSharesTable).omit({
  id: true,
  createdAt: true,
});
export const insertActivityLogSchema = createInsertSchema(activityLogsTable).omit({
  id: true,
  createdAt: true,
});
export const insertFileVersionSchema = createInsertSchema(fileVersionsTable).omit({
  id: true,
  createdAt: true,
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type File = typeof filesTable.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;
export type ShareLink = typeof shareLinksTable.$inferSelect;
export type InsertShareLink = z.infer<typeof insertShareLinkSchema>;
export type Folder = typeof foldersTable.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type FolderShare = typeof folderSharesTable.$inferSelect;
export type InsertFolderShare = z.infer<typeof insertFolderShareSchema>;
export type ActivityLog = typeof activityLogsTable.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type FileVersion = typeof fileVersionsTable.$inferSelect;
export type InsertFileVersion = z.infer<typeof insertFileVersionSchema>;
export type UserSession = typeof userSessionsTable.$inferSelect;

export const insertUserSessionSchema = createInsertSchema(userSessionsTable).omit({
  id: true,
  createdAt: true,
  lastSeenAt: true,
});
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
