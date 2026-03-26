import {
  FolderSync,
  FolderOpen,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Zap,
  X,
} from "lucide-react";
import { useFolderSyncCtx } from "@/contexts/folder-sync-context";
import { cn } from "@/lib/utils";

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export function MobileSyncBar() {
  const { state, sync, disconnect } = useFolderSyncCtx();
  const { status, folderName, lastSyncedAt, result, progress, autoSyncEnabled } = state;

  if (!folderName) return null;

  const isSyncing = status === "scanning" || status === "uploading" || status === "downloading";
  const syncPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-white/10 safe-area-pb">
      <div className="px-4 pt-3 pb-3 space-y-2">
        {/* Row 1 — folder name + status badge + actions */}
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 flex-shrink-0 text-yellow-500/80" />
          <span className="flex-1 text-xs font-semibold text-foreground/80 truncate" title={folderName}>
            {folderName}
          </span>

          {autoSyncEnabled && !isSyncing && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-[9px] font-semibold text-green-400/80 flex-shrink-0">
              <Zap className="w-2.5 h-2.5" />
              Auto
            </span>
          )}

          {/* Sync now button */}
          <button
            onClick={sync}
            disabled={isSyncing}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex-shrink-0",
              isSyncing
                ? "bg-primary/10 text-primary/60 cursor-not-allowed"
                : "bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
            )}
          >
            <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
            {isSyncing
              ? status === "uploading" ? "Uploading…"
              : status === "downloading" ? "Downloading…"
              : "Scanning…"
              : "Sync"}
          </button>

          {/* Disconnect */}
          <button
            onClick={disconnect}
            disabled={isSyncing}
            title="Disconnect folder"
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors disabled:opacity-30 flex-shrink-0 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Row 2 — progress bar while syncing */}
        {isSyncing && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className={cn("truncate max-w-[220px]", !progress.file && "italic opacity-60")}>
                {progress.file ||
                  (status === "scanning" ? "Scanning folder…"
                  : status === "uploading" ? "Uploading…"
                  : "Downloading…")}
              </span>
              {progress.total > 0 && (
                <span className="flex-shrink-0 ml-1 tabular-nums">{syncPct}%</span>
              )}
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  status === "downloading" ? "bg-accent" : "bg-primary"
                )}
                style={{
                  width: progress.total > 0 ? `${syncPct}%` : "40%",
                  animation: progress.total === 0 ? "pulse 1.5s ease-in-out infinite" : "none",
                }}
              />
            </div>
          </div>
        )}

        {/* Row 2 — status line when idle / done / error */}
        {!isSyncing && (
          <div className="flex items-center gap-1.5 text-[10px]">
            {status === "done" && result && (
              <>
                <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                <span className="text-muted-foreground">
                  {result.uploaded > 0 && `${result.uploaded} uploaded`}
                  {result.uploaded > 0 && result.downloaded > 0 && " · "}
                  {result.downloaded > 0 && `${result.downloaded} downloaded`}
                  {result.uploaded === 0 && result.downloaded === 0 && "Up to date"}
                  {lastSyncedAt && <span className="ml-1 opacity-60">· {timeAgo(lastSyncedAt)}</span>}
                </span>
              </>
            )}
            {status === "error" && result && (
              <>
                <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                <span className="text-red-400/80 truncate" title={result.errors.join("; ")}>
                  {result.errors[0] ?? "Sync error"}
                </span>
              </>
            )}
            {status === "idle" && (
              <>
                <FolderSync className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
                <span className="text-muted-foreground/60">
                  {lastSyncedAt ? `Synced ${timeAgo(lastSyncedAt)}` : "Not synced yet · auto-syncs in 10m"}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
