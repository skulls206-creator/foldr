import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

// ── Constants ─────────────────────────────────────────────────────────────

const AUTO_SYNC_MS = 10 * 60 * 1000; // 10 minutes

// ── Types ─────────────────────────────────────────────────────────────────

export type SyncStatus = "idle" | "scanning" | "uploading" | "downloading" | "done" | "error";

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  skipped: number;
  errors: string[];
}

export interface SyncProgress {
  current: number;
  total: number;
  file: string;
}

export interface SyncState {
  status: SyncStatus;
  folderName: string | null;
  lastSyncedAt: Date | null;
  isSupported: boolean;
  /** True when running inside a cross-origin iframe (e.g. Discord, KHURK OS).
   *  showDirectoryPicker() is blocked by browsers in that context. */
  isEmbedded: boolean;
  autoSyncEnabled: boolean;
  result: SyncResult | null;
  progress: SyncProgress;
}

interface CloudFolder {
  id: string;
  name: string;
  parentId: string | null;
}

interface CloudFile {
  id: string;
  name: string;
  size: number;
  folderId: string | null;
  updatedAt: string;
  createdAt: string;
}

// A local file entry with the directory handle it lives in and
// the cloud folder it belongs to (null = root).
interface LocalEntry {
  file: File;
  dirHandle: any;
  cloudFolderId: string | null;
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────

const DB_NAME = "foldr-sync-db";
const DB_VERSION = 2;
const HANDLE_STORE = "handles";
const META_STORE = "meta";
const FINGERPRINT_STORE = "fingerprints";

interface Fingerprint {
  size: number;
  lastModified: number;
}

function openSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(HANDLE_STORE)) {
        req.result.createObjectStore(HANDLE_STORE);
      }
      if (!req.result.objectStoreNames.contains(META_STORE)) {
        req.result.createObjectStore(META_STORE);
      }
      if (!req.result.objectStoreNames.contains(FINGERPRINT_STORE)) {
        req.result.createObjectStore(FINGERPRINT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll<T>(store: string): Promise<Map<string, T>> {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const result = new Map<string, T>();
    const cursorReq = tx.objectStore(store).openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        result.set(cursor.key as string, cursor.value as T);
        cursor.continue();
      }
    };
    tx.oncomplete = () => { resolve(result); db.close(); };
    tx.onerror = () => { reject(tx.error); db.close(); };
  });
}

async function dbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => { resolve(req.result); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

async function dbSet(store: string, key: string, value: unknown): Promise<void> {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).put(value, key);
    req.onsuccess = () => { resolve(); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

async function dbDelete(store: string, key: string): Promise<void> {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => { resolve(); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

// ── API helpers ───────────────────────────────────────────────────────────

function uploadFileXhr(file: File, folderId?: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.withCredentials = true;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error ?? `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    const fd = new FormData();
    fd.append("file", file);
    fd.append("encrypt", "true");
    if (folderId) fd.append("folderId", folderId);
    xhr.send(fd);
  });
}

async function fetchAllCloudFolders(): Promise<CloudFolder[]> {
  const res = await fetch("/api/folders", { credentials: "include" });
  if (!res.ok) throw new Error("Could not fetch folders from server");
  const data = await res.json();
  return (data.folders ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId ?? null,
  }));
}

async function createCloudFolder(name: string, parentId: string | null): Promise<CloudFolder> {
  const res = await fetch("/api/folders", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentId: parentId ?? undefined }),
  });
  if (!res.ok) throw new Error(`Could not create folder "${name}" in app`);
  const f = await res.json();
  return { id: f.id, name: f.name, parentId: f.parentId ?? null };
}

async function listAllCloudFiles(): Promise<CloudFile[]> {
  const first = await fetch("/api/files?limit=100&page=1", { credentials: "include" });
  if (!first.ok) throw new Error("Could not reach the server to list files");
  const data = await first.json();
  const files: CloudFile[] = (data.files ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    size: Number(f.size),
    folderId: f.folderId ?? null,
    updatedAt: f.updatedAt,
    createdAt: f.createdAt,
  }));
  const total: number = data.total ?? files.length;
  if (total > 100) {
    const pages = Math.ceil(total / 100);
    for (let p = 2; p <= pages; p++) {
      const r = await fetch(`/api/files?limit=100&page=${p}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        files.push(...(d.files ?? []).map((f: any) => ({
          id: f.id,
          name: f.name,
          size: Number(f.size),
          folderId: f.folderId ?? null,
          updatedAt: f.updatedAt,
          createdAt: f.createdAt,
        })));
      }
    }
  }
  return files;
}

async function downloadCloudFile(fileId: string): Promise<Blob> {
  const res = await fetch(`/api/files/${fileId}/download`, { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}

// ── Recursive directory walker ────────────────────────────────────────────
//
// Walks the local directory tree.  For every subdirectory it encounters, it
// looks up (or creates) the matching cloud folder so files can be uploaded
// to the right place.  Returns:
//   localEntries  — every file found, tagged with its dirHandle and cloud folder ID
//   cloudFolders  — the updated list (may include newly-created cloud folders)
//   folderHandles — map of cloud folder ID → local directory handle
//
async function walkLocalDir(
  dirHandle: any,
  cloudFolders: CloudFolder[],
  cloudParentId: string | null,
  folderHandles: Map<string | null, any>,
): Promise<{ localEntries: LocalEntry[]; cloudFolders: CloudFolder[] }> {
  const localEntries: LocalEntry[] = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file") {
      try {
        const f: File = await entry.getFile();
        localEntries.push({ file: f, dirHandle, cloudFolderId: cloudParentId });
      } catch { /* skip unreadable */ }
    } else if (entry.kind === "directory") {
      // Find an existing cloud folder with this name under the same parent,
      // or create one so the web app mirrors the local structure.
      const existing = cloudFolders.find(
        cf => cf.name === entry.name && cf.parentId === cloudParentId,
      );
      let cloudFolder: CloudFolder;
      if (existing) {
        cloudFolder = existing;
      } else {
        cloudFolder = await createCloudFolder(entry.name, cloudParentId);
        cloudFolders = [...cloudFolders, cloudFolder];
      }

      // Record the handle so we can write downloads into the right directory.
      folderHandles.set(cloudFolder.id, entry);

      // Recurse into the subdirectory.
      const sub = await walkLocalDir(entry, cloudFolders, cloudFolder.id, folderHandles);
      localEntries.push(...sub.localEntries);
      cloudFolders = sub.cloudFolders;
    }
  }

  return { localEntries, cloudFolders };
}

// ── Hook ──────────────────────────────────────────────────────────────────

const BROWSER_SUPPORTED =
  typeof window !== "undefined" && "showDirectoryPicker" in window;

// Cross-origin iframes (Discord, KHURK OS, etc.) block showDirectoryPicker
// even when the browser supports it — detect this up-front.
const IS_EMBEDDED =
  typeof window !== "undefined" && window.self !== window.top;

export function useFolderSync() {
  const queryClient = useQueryClient();
  const isSyncingRef = useRef(false);

  const [state, setState] = useState<SyncState>({
    status: "idle",
    folderName: null,
    lastSyncedAt: null,
    isSupported: BROWSER_SUPPORTED,
    isEmbedded: IS_EMBEDDED,
    autoSyncEnabled: false,
    result: null,
    progress: { current: 0, total: 0, file: "" },
  });

  const syncRef = useRef<() => Promise<void>>(async () => {});

  // ── Restore persisted state on mount ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const handle = await dbGet<FileSystemDirectoryHandle>(HANDLE_STORE, "dir");
        const meta = await dbGet<{ folderName: string; lastSyncedAt: string | null }>(META_STORE, "sync");
        if (handle && meta) {
          const perm = await (handle as any).queryPermission({ mode: "readwrite" });
          if (perm === "granted" || perm === "prompt") {
            setState(s => ({
              ...s,
              folderName: meta.folderName,
              lastSyncedAt: meta.lastSyncedAt ? new Date(meta.lastSyncedAt) : null,
              autoSyncEnabled: true,
            }));
          }
        }
      } catch {
        // IndexedDB not available or handle stale — ignore
      }
    })();
  }, []);

  // ── Shared: persist a directory handle and update state ───────────────────
  const connectHandle = useCallback(async (handle: FileSystemDirectoryHandle) => {
    await dbSet(HANDLE_STORE, "dir", handle);
    await dbSet(META_STORE, "sync", { folderName: handle.name, lastSyncedAt: null });
    setState(s => ({
      ...s,
      folderName: handle.name,
      lastSyncedAt: null,
      autoSyncEnabled: true,
      isEmbedded: false, // handle received — iframe restriction bypassed
      result: null,
      status: "idle",
    }));
    return handle;
  }, []);

  const pickFolder = useCallback(async () => {
    if (!BROWSER_SUPPORTED) return;
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      return await connectHandle(handle);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setState(s => ({
          ...s,
          status: "error",
          result: { uploaded: 0, downloaded: 0, skipped: 0, errors: ["Could not open folder"] },
        }));
      }
      return null;
    }
  }, [connectHandle]);

  // ── postMessage bridge — KHURK OS sends the handle on behalf of the user ─
  useEffect(() => {
    async function onMessage(event: MessageEvent) {
      if (event.data?.type !== "khurk:fs-directory") return;
      const handle: FileSystemDirectoryHandle | undefined = event.data.handle;
      if (!handle || typeof handle.values !== "function") return;
      try {
        // The parent already has permission; confirm readwrite for this frame.
        const perm = await (handle as any).requestPermission({ mode: "readwrite" });
        if (perm !== "granted") return;
        await connectHandle(handle);
      } catch { /* ignore — permission may not be re-grantable in this context */ }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [connectHandle]);

  const sync = useCallback(async () => {
    if (isSyncingRef.current) return;

    let handle = await dbGet<FileSystemDirectoryHandle>(HANDLE_STORE, "dir");
    if (!handle) {
      handle = (await pickFolder()) ?? undefined;
      if (!handle) return;
    }

    // Re-acquire permission if needed
    let perm = await (handle as any).queryPermission({ mode: "readwrite" });
    if (perm === "prompt") {
      perm = await (handle as any).requestPermission({ mode: "readwrite" });
    }
    if (perm !== "granted") {
      setState(s => ({
        ...s,
        status: "error",
        result: { uploaded: 0, downloaded: 0, skipped: 0, errors: ["Permission denied — click Sync Now to re-allow"] },
      }));
      return;
    }

    isSyncingRef.current = true;
    const result: SyncResult = { uploaded: 0, downloaded: 0, skipped: 0, errors: [] };

    setState(s => ({ ...s, status: "scanning", progress: { current: 0, total: 0, file: "Scanning…" } }));

    try {
      // ── 1. Fetch cloud folders so the walker can match / create them ─────
      setState(s => ({ ...s, progress: { current: 0, total: 0, file: "Fetching cloud folders…" } }));
      let cloudFolders = await fetchAllCloudFolders();

      // folderHandles maps cloud folder ID → local dir handle.
      // null key represents the root of the chosen local folder.
      const folderHandles = new Map<string | null, any>();
      folderHandles.set(null, handle);

      // ── 2. Walk local directory tree recursively ─────────────────────────
      //    Subfolders are auto-created in the app when they don't exist yet.
      setState(s => ({ ...s, progress: { current: 0, total: 0, file: "Scanning local folders…" } }));
      const { localEntries, cloudFolders: updatedFolders } = await walkLocalDir(
        handle,
        cloudFolders,
        null,
        folderHandles,
      );
      cloudFolders = updatedFolders;

      // ── 3. Ensure local dirs exist for any cloud-only folders ────────────
      //    Do multiple passes to handle folders nested more than one level deep.
      for (let pass = 0; pass < 5; pass++) {
        for (const cf of cloudFolders) {
          if (!folderHandles.has(cf.id)) {
            const parentDirHandle = folderHandles.get(cf.parentId ?? null);
            if (parentDirHandle) {
              const subDir = await parentDirHandle.getDirectoryHandle(cf.name, { create: true });
              folderHandles.set(cf.id, subDir);
            }
          }
        }
      }

      // ── 4. Fetch all cloud files (across all folders) ────────────────────
      const cloudFiles = await listAllCloudFiles();

      // Key: "${folderId ?? 'root'}::${name}" for O(1) lookup
      const cloudByKey = new Map<string, CloudFile>();
      for (const cf of cloudFiles) {
        cloudByKey.set(`${cf.folderId ?? "root"}::${cf.name}`, cf);
      }

      // Build the same keyed map for local entries
      const localByKey = new Map<string, LocalEntry>();
      for (const entry of localEntries) {
        localByKey.set(`${entry.cloudFolderId ?? "root"}::${entry.file.name}`, entry);
      }

      // ── 4b. Load fingerprint cache (size + lastModified of last upload) ──
      // A fingerprint match means the local file hasn't changed since we last
      // uploaded it — we can skip it completely regardless of cloud timestamps.
      const fingerprintCache = await dbGetAll<Fingerprint>(FINGERPRINT_STORE);
      const fingerprintUpdates = new Map<string, Fingerprint>();

      // ── 5. Decide what to upload / download / skip ───────────────────────
      const toUpload: LocalEntry[] = [];
      const toDownload: Array<{ cloudFile: CloudFile; targetDirHandle: any }> = [];
      // Track files downloaded this session so we don't immediately re-upload them
      const downloadedKeys = new Set<string>();

      // Local → cloud
      for (const entry of localEntries) {
        const key = `${entry.cloudFolderId ?? "root"}::${entry.file.name}`;
        const cloud = cloudByKey.get(key);
        if (!cloud) {
          // Not in cloud at all — always upload
          toUpload.push(entry);
        } else {
          // Check fingerprint first: if size AND lastModified match what we
          // last uploaded, the file definitely hasn't changed — skip it.
          const fp = fingerprintCache.get(key);
          const unchanged =
            fp !== undefined &&
            fp.size === entry.file.size &&
            fp.lastModified === entry.file.lastModified;

          if (unchanged) {
            result.skipped++;
          } else {
            // File changed or never fingerprinted — fall back to timestamp comparison
            const cloudMs = new Date(cloud.updatedAt).getTime();
            if (entry.file.lastModified > cloudMs + 5_000) {
              toUpload.push(entry);
            } else {
              result.skipped++;
            }
          }
        }
      }

      // Cloud → local
      for (const cloudFile of cloudFiles) {
        const key = `${cloudFile.folderId ?? "root"}::${cloudFile.name}`;
        const localEntry = localByKey.get(key);
        const targetDirHandle = folderHandles.get(cloudFile.folderId ?? null);
        if (!targetDirHandle) {
          // Cloud folder has no local counterpart and we couldn't create it — skip
          result.skipped++;
          continue;
        }
        if (!localEntry) {
          toDownload.push({ cloudFile, targetDirHandle });
        } else {
          const cloudMs = new Date(cloudFile.updatedAt).getTime();
          if (cloudMs > localEntry.file.lastModified + 5_000) {
            toDownload.push({ cloudFile, targetDirHandle });
          }
        }
      }

      const total = toUpload.length + toDownload.length;
      let current = 0;

      // ── 6. Upload local → cloud ──────────────────────────────────────────
      setState(s => ({ ...s, status: "uploading", progress: { current, total, file: "" } }));

      for (const entry of toUpload) {
        const key = `${entry.cloudFolderId ?? "root"}::${entry.file.name}`;
        setState(s => ({ ...s, progress: { current, total, file: entry.file.name } }));
        try {
          await uploadFileXhr(entry.file, entry.cloudFolderId);
          result.uploaded++;
          // Record fingerprint so this exact file is skipped on future syncs
          // unless its size or lastModified actually changes on disk.
          fingerprintUpdates.set(key, { size: entry.file.size, lastModified: entry.file.lastModified });
        } catch (e: any) {
          result.errors.push(`↑ ${entry.file.name}: ${e.message}`);
        }
        current++;
        setState(s => ({ ...s, progress: { current, total, file: "" } }));
      }

      // ── 7. Download cloud → local ────────────────────────────────────────
      setState(s => ({ ...s, status: "downloading", progress: { current, total, file: "" } }));

      for (const { cloudFile, targetDirHandle } of toDownload) {
        const key = `${cloudFile.folderId ?? "root"}::${cloudFile.name}`;
        setState(s => ({ ...s, progress: { current, total, file: cloudFile.name } }));
        try {
          const blob = await downloadCloudFile(cloudFile.id);
          const fh = await targetDirHandle.getFileHandle(cloudFile.name, { create: true });
          const writable = await fh.createWritable();
          await writable.write(blob);
          await writable.close();
          result.downloaded++;
          downloadedKeys.add(key);
          // Read the written file back to capture its actual lastModified so we
          // can fingerprint it — prevents an immediate re-upload on the next cycle.
          try {
            const writtenFile = await fh.getFile();
            fingerprintUpdates.set(key, { size: writtenFile.size, lastModified: writtenFile.lastModified });
          } catch { /* fingerprint is best-effort */ }
        } catch (e: any) {
          result.errors.push(`↓ ${cloudFile.name}: ${e.message}`);
        }
        current++;
        setState(s => ({ ...s, progress: { current, total, file: "" } }));
      }

      // ── 7b. Persist fingerprints to IndexedDB ────────────────────────────
      // Write all upload + download fingerprints in one batch so future syncs
      // can skip files that haven't changed since they were last transferred.
      for (const [key, fp] of fingerprintUpdates) {
        await dbSet(FINGERPRINT_STORE, key, fp).catch(() => {});
      }

      // ── 8. Finalise ───────────────────────────────────────────────────────
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });

      const now = new Date();
      const folderName = handle.name;
      await dbSet(META_STORE, "sync", { folderName, lastSyncedAt: now.toISOString() });

      setState(s => ({
        ...s,
        status: result.errors.length > 0 && result.uploaded + result.downloaded === 0 ? "error" : "done",
        lastSyncedAt: now,
        result,
        progress: { current: total, total, file: "" },
      }));
    } catch (e: any) {
      result.errors.push(e.message ?? "Unknown error");
      setState(s => ({ ...s, status: "error", result }));
    } finally {
      isSyncingRef.current = false;
    }
  }, [pickFolder, queryClient]);

  // Keep syncRef current so interval/SW listener always call the latest sync
  useEffect(() => { syncRef.current = sync; }, [sync]);

  const disconnect = useCallback(async () => {
    if (isSyncingRef.current) return;
    await dbDelete(HANDLE_STORE, "dir").catch(() => {});
    await dbDelete(META_STORE, "sync").catch(() => {});
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg && "periodicSync" in reg) {
        await (reg as any).periodicSync.unregister("folder-sync");
      }
    } catch { /* not supported — ignore */ }
    setState(s => ({
      ...s,
      status: "idle",
      folderName: null,
      lastSyncedAt: null,
      autoSyncEnabled: false,
      result: null,
      progress: { current: 0, total: 0, file: "" },
    }));
  }, []);

  // ── Auto-sync setup ────────────────────────────────────────────────────────
  useEffect(() => {
    const folderName = state.folderName;
    if (!folderName) return;

    const intervalId = setInterval(() => {
      if (!isSyncingRef.current) syncRef.current();
    }, AUTO_SYNC_MS);

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "BACKGROUND_SYNC_REQUESTED" && !isSyncingRef.current) {
        syncRef.current();
      }
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    (async () => {
      try {
        const reg = await navigator.serviceWorker?.ready;
        if (reg && "periodicSync" in reg) {
          await (reg as any).periodicSync.register("folder-sync", {
            minInterval: AUTO_SYNC_MS,
          });
        }
      } catch { /* not supported */ }
    })();

    return () => {
      clearInterval(intervalId);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [state.folderName]);

  return { state, pickFolder, sync, disconnect };
}
