import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { File, Folder, FolderListResponse } from "./generated/api.schemas";

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  fileCount: number;
}

export interface ActivityLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface FileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  cid: string;
  size: number;
  storageBackend: string;
  createdAt: string;
}

export interface FolderShare {
  shared: boolean;
  id?: string;
  folderId?: string;
  token?: string;
  url?: string;
  createdAt?: string;
}

export function useStorageUsage() {
  return useQuery({
    queryKey: ["/api/files/usage"],
    queryFn: () => customFetch<StorageUsage>("/api/files/usage", { method: "GET" }),
    refetchInterval: 30_000,
  });
}

// ── File operations ────────────────────────────────────────────────────────

export function useToggleStarFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      customFetch<File>(`/api/files/${id}/star`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    },
  });
}

export function useRenameFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      customFetch<File>(`/api/files/${id}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    },
  });
}

export function useMoveFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      customFetch<File>(`/api/files/${id}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    },
  });
}

export function useRestoreFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      customFetch<File>(`/api/files/${id}/restore`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files/usage"] });
    },
  });
}

export function useListTrash() {
  return useQuery({
    queryKey: ["/api/files/trash"],
    queryFn: () => customFetch<{ files: File[] }>("/api/files/trash", { method: "GET" }),
  });
}

export function useEmptyTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      customFetch<{ deleted: number }>("/api/files/trash", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files/usage"] });
    },
  });
}

export function useFileVersions(fileId: string | null) {
  return useQuery({
    queryKey: ["/api/files", fileId, "versions"],
    queryFn: () => customFetch<{ versions: FileVersion[] }>(`/api/files/${fileId}/versions`, { method: "GET" }),
    enabled: !!fileId,
  });
}

// ── Folder operations ──────────────────────────────────────────────────────

export function useListFolders() {
  return useQuery({
    queryKey: ["/api/folders"],
    queryFn: () => customFetch<FolderListResponse>("/api/folders", { method: "GET" }),
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: string | null }) =>
      customFetch<Folder>("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      customFetch<{ message: string }>(`/api/folders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    },
  });
}

export function useRenameFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      customFetch<Folder>(`/api/folders/${id}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
    },
  });
}

export function useCreateFolderShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      customFetch<FolderShare>(`/api/folders/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders", vars.id, "share"] });
    },
  });
}

export function useFolderShare(folderId: string | null) {
  return useQuery({
    queryKey: ["/api/folders", folderId, "share"],
    queryFn: () => customFetch<FolderShare>(`/api/folders/${folderId}/share`, { method: "GET" }),
    enabled: !!folderId,
  });
}

export function useDeleteFolderShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      customFetch<{ message: string }>(`/api/folders/${id}/share`, { method: "DELETE" }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders", vars.id, "share"] });
    },
  });
}

// ── Bulk operations ──────────────────────────────────────────────────────────

export function useBulkDeleteFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids }: { ids: string[] }) =>
      customFetch<{ deleted: number }>("/api/files/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files/usage"] });
    },
  });
}

export function useBulkStarFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, starred }: { ids: string[]; starred: boolean }) =>
      customFetch<{ starred: boolean; count: number }>("/api/files/bulk-star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, starred }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    },
  });
}

export function useBulkMoveFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, folderId }: { ids: string[]; folderId: string | null }) =>
      customFetch<{ moved: number; folderId: string | null }>("/api/files/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, folderId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    },
  });
}

export function useBulkDeleteFolders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids }: { ids: string[] }) =>
      customFetch<{ deleted: number }>("/api/folders/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    },
  });
}

// ── Share links ──────────────────────────────────────────────────────────

export interface ShareLink {
  id: string;
  fileId: string;
  fileName: string | null;
  token: string;
  url: string;
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
  downloadCount: number;
  label: string | null;
  createdAt: string;
}

export function useAllShareLinks(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ["/api/files/share-links"],
    queryFn: () => customFetch<{ shareLinks: ShareLink[] }>("/api/files/share-links", { method: "GET" }),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: options?.refetchInterval ?? 15_000,
  });
}

export function useFileShareLinks(fileId: string | null) {
  return useQuery({
    queryKey: ["/api/files", fileId, "share-links"],
    queryFn: () => customFetch<{ shareLinks: ShareLink[] }>(`/api/files/${fileId}/share-links`, { method: "GET" }),
    enabled: !!fileId,
  });
}

export function useRevokeShareLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId }: { linkId: string }) =>
      customFetch<{ message: string }>(`/api/files/share-links/${linkId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files/share-links"] });
    },
  });
}

export function useRestoreFileVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, versionId }: { fileId: string; versionId: string }) =>
      customFetch<any>(`/api/files/${fileId}/versions/${versionId}/restore`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    },
  });
}

export function useBulkDownloadFiles() {
  return useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      const resp = await fetch("/api/files/bulk-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      if (!resp.ok) throw new Error("Bulk download failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foldr-download-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}

export interface LoginSession {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export function useLoginSessions() {
  return useQuery({
    queryKey: ["/api/auth/sessions"],
    queryFn: () => customFetch<{ sessions: LoginSession[] }>("/api/auth/sessions", { method: "GET" }),
  });
}

// ── Activity log ─────────────────────────────────────────────────────────

export function useListActivity(limit?: number) {
  return useQuery({
    queryKey: ["/api/activity", limit],
    queryFn: () => customFetch<{ activity: ActivityLog[] }>(`/api/activity?limit=${limit ?? 50}`, { method: "GET" }),
  });
}

// ── TOTP / 2FA ────────────────────────────────────────────────────────────

export function useTotpSetup() {
  return useMutation({
    mutationFn: () =>
      customFetch<{ secret: string; otpauthUri: string }>("/api/auth/totp/setup", { method: "POST" }),
  });
}

export function useTotpConfirm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code }: { code: string }) =>
      customFetch<{ message: string }>("/api/auth/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}

export function useTotpChallenge() {
  return useMutation({
    mutationFn: ({ pendingToken, code }: { pendingToken: string; code: string }) =>
      customFetch<{ user: any; message: string }>("/api/auth/totp/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, code }),
      }),
  });
}

export function useDisableTotp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code }: { code: string }) =>
      customFetch<{ message: string }>("/api/auth/totp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}
