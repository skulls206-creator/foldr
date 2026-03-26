import {
  FolderSync,
  FolderOpen,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  MonitorSmartphone,
  AlertTriangle,
  Zap,
  ExternalLink,
} from "lucide-react";
import { useFolderSyncCtx } from "@/contexts/folder-sync-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SyncWidget() {
  const { state, pickFolder, sync, disconnect } = useFolderSyncCtx();
  const { status, folderName, lastSyncedAt, isSupported, isEmbedded, autoSyncEnabled, result, progress } = state;

  const isSyncing = status === "scanning" || status === "uploading" || status === "downloading";
  const syncPct =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  // ── Unsupported browser ────────────────────────────────────────────────
  if (!isSupported) {
    return (
      <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-amber-500/8 border border-amber-500/15 text-[10px] text-amber-400/70">
        <MonitorSmartphone className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Local folder sync requires <strong>Chrome or Edge</strong>. Firefox & Safari don't support it yet.
        </span>
      </div>
    );
  }

  // ── Embedded in iframe (Discord, KHURK OS, etc.) ───────────────────────
  // showDirectoryPicker() is blocked by browsers in cross-origin iframes.
  // KHURK OS bypasses this by picking the folder itself and posting the handle
  // to us via postMessage (khurk:fs-directory). Until that arrives, show a
  // waiting state rather than a broken button.
  if (isEmbedded) {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-white/4 border border-white/8 text-[10px] text-muted-foreground/70">
          <FolderSync className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground/40" />
          <span>
            Use the <strong className="text-foreground/60">folder icon</strong> in the KHURK OS window bar to connect a local folder — your browser blocks direct folder access inside embedded apps.
          </span>
        </div>
        <a
          href="https://foldr.khurk.services"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 w-full h-7 rounded-lg border border-white/10 bg-transparent text-muted-foreground hover:text-foreground hover:bg-white/5 hover:border-white/20 transition-colors text-[10px] font-medium"
        >
          <ExternalLink className="w-3 h-3" />
          Open standalone instead
        </a>
      </div>
    );
  }

  // ── No folder connected ────────────────────────────────────────────────
  if (!folderName) {
    return (
      <button
        onClick={pickFolder}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-dashed border-white/10 bg-transparent hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 text-left group"
      >
        <div className="p-1.5 rounded-md bg-white/5 group-hover:bg-primary/10 transition-colors flex-shrink-0">
          <FolderSync className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground/80 group-hover:text-foreground transition-colors">
            Connect Local Folder
          </p>
          <p className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5">
            Auto-syncs every 10 min — Chrome / Edge only
          </p>
        </div>
      </button>
    );
  }

  // ── Folder connected ───────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Folder header */}
      <div className="flex items-center gap-2">
        <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-yellow-500/70" />
        <span
          className="flex-1 text-xs font-semibold text-foreground/80 truncate"
          title={folderName}
        >
          {folderName}
        </span>
        {/* Auto-sync pill */}
        {autoSyncEnabled && !isSyncing && (
          <span
            title="Auto-syncs every 10 minutes while this tab is open"
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-[9px] font-semibold text-green-400/80 flex-shrink-0"
          >
            <Zap className="w-2.5 h-2.5" />
            Auto
          </span>
        )}
        <button
          onClick={disconnect}
          disabled={isSyncing}
          title="Disconnect folder"
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors disabled:opacity-30 flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Progress bar — shown while syncing */}
      {isSyncing && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className={cn("truncate max-w-[140px]", !progress.file && "italic opacity-60")}>
              {progress.file ||
                (status === "scanning"
                  ? "Scanning folder…"
                  : status === "uploading"
                  ? "Uploading…"
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

      {/* Status line — shown when idle / done / error */}
      {!isSyncing && (
        <div className="flex items-center gap-1.5 text-[10px]">
          {status === "done" && result && (
            <>
              <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
              <span className="text-muted-foreground">
                {result.uploaded > 0 && `${result.uploaded} ↑`}
                {result.uploaded > 0 && result.downloaded > 0 && "  "}
                {result.downloaded > 0 && `${result.downloaded} ↓`}
                {result.uploaded === 0 && result.downloaded === 0 && "Up to date"}
                {lastSyncedAt && (
                  <span className="ml-1 opacity-60">· {timeAgo(lastSyncedAt)}</span>
                )}
              </span>
            </>
          )}
          {status === "error" && result && (
            <>
              <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
              <span
                className="text-red-400/80 truncate"
                title={result.errors.join("; ")}
              >
                {result.errors[0] ?? "Sync error"}
              </span>
            </>
          )}
          {status === "idle" && (
            <>
              <FolderSync className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
              <span className="text-muted-foreground/60">
                {lastSyncedAt ? `Last synced ${timeAgo(lastSyncedAt)}` : "Never synced · syncs in 10m"}
              </span>
            </>
          )}
        </div>
      )}

      {/* Partial-error notice when some files failed */}
      {!isSyncing && status === "done" && result && result.errors.length > 0 && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-500/8 border border-amber-500/15 text-[10px] text-amber-400/80">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>{result.errors.length} file{result.errors.length > 1 ? "s" : ""} had errors</span>
        </div>
      )}

      {/* Sync / Syncing button */}
      <Button
        variant="outline"
        size="sm"
        onClick={sync}
        disabled={isSyncing}
        className="w-full h-7 text-xs border-white/10 hover:border-primary/40 hover:text-primary hover:bg-primary/5 gap-1.5 disabled:opacity-50"
      >
        <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
        {isSyncing
          ? status === "uploading"
            ? "Uploading…"
            : status === "downloading"
            ? "Downloading…"
            : "Scanning…"
          : "Sync Now"}
      </Button>
    </div>
  );
}
