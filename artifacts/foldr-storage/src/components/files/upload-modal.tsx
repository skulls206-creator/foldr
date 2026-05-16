import { useState, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  UploadCloud, X, Lock, File as FileIcon, ShieldCheck,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Plus,
} from "lucide-react";
import { useUploadWithProgress } from "@/hooks/use-upload";
import { useStorageUsage } from "@workspace/api-client-react";
import { formatBytes } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId?: string | null;
}

type FileStatus = "pending" | "uploading" | "done" | "error";

interface QueuedFile {
  id: string;
  file: File;
  status: FileStatus;
  errorMsg?: string;
}

let idCounter = 0;
function makeId() {
  return `qf-${++idCounter}`;
}

function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Upload failed";
}

export function UploadModal({ isOpen, onClose, folderId }: UploadModalProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [runIndex, setRunIndex] = useState(0);
  const [runTotal, setRunTotal] = useState(0);
  const { upload, progress } = useUploadWithProgress();
  const { data: usage } = useStorageUsage();
  const { toast } = useToast();

  const LIMIT = usage?.limitBytes ?? 100 * 1024 * 1024;
  const used = usage?.usedBytes ?? 0;
  const remaining = Math.max(0, LIMIT - used);
  const isFull = used >= LIMIT;

  const pct = Math.min(100, (used / LIMIT) * 100);
  const barColor =
    pct >= 90 ? "bg-red-500" :
    pct >= 75 ? "bg-yellow-500" :
    "bg-green-500";

  const totalQueueSize = queue.reduce((sum, q) => sum + q.file.size, 0);

  // Compute which files would be skipped due to cumulative storage overflow.
  // Simulate the sequential upload loop to pre-flag items before the user clicks upload.
  const wouldExceedSet = useMemo<Set<string>>(() => {
    const skipped = new Set<string>();
    let runningUsed = used;
    for (const q of queue) {
      if (q.status === "done") continue;
      if (runningUsed + q.file.size > LIMIT) {
        skipped.add(q.id);
      } else {
        runningUsed += q.file.size;
      }
    }
    return skipped;
  }, [queue, used, LIMIT]);

  const pendingCount = queue.filter((q) => q.status === "pending").length;
  const errorCount = queue.filter((q) => q.status === "error").length;
  const doneCount = queue.filter((q) => q.status === "done").length;
  const uploadingItem = currentIndex >= 0 ? queue[currentIndex] : null;
  const hasActionable = pendingCount > 0 || errorCount > 0;

  const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    setQueue((prev) => {
      const existing = new Set(prev.map((q) => fileKey(q.file)));
      const fresh = acceptedFiles
        .filter((f) => !existing.has(fileKey(f)))
        .map((f) => ({ id: makeId(), file: f, status: "pending" as FileStatus }));
      return [...prev, ...fresh];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, open: openPicker } = useDropzone({
    onDrop,
    multiple: true,
    disabled: isRunning || isFull,
    noClick: queue.length > 0,
    noKeyboard: queue.length > 0,
  });

  const removeFile = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const handleUpload = async () => {
    if (!hasActionable || isRunning) return;

    // Reset any previously failed items back to pending so they can be retried
    const uploadSnapshot = queue.map((q) =>
      q.status === "error" ? { ...q, status: "pending" as FileStatus, errorMsg: undefined } : q
    );
    setQueue(uploadSnapshot);

    const actionableCount = uploadSnapshot.filter((q) => q.status !== "done").length;
    setRunIndex(0);
    setRunTotal(actionableCount);
    setIsRunning(true);
    let successCount = 0;
    let failCount = 0;
    let runningUsed = used;
    let activeRun = 0;

    for (let i = 0; i < uploadSnapshot.length; i++) {
      const item = uploadSnapshot[i];
      if (item.status === "done") { successCount++; continue; }
      if (item.status !== "pending") continue;

      activeRun++;
      setRunIndex(activeRun);

      // Skip files that would push storage over the limit
      if (runningUsed + item.file.size > LIMIT) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "error", errorMsg: "Exceeds storage limit" }
              : q
          )
        );
        failCount++;
        continue;
      }

      setCurrentIndex(i);
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "uploading" } : q))
      );

      try {
        await upload(item.file, true, folderId ?? undefined, { silent: true });
        runningUsed += item.file.size;
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "done" } : q))
        );
        successCount++;
      } catch (e: unknown) {
        const msg = extractErrorMessage(e);
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "error", errorMsg: msg } : q
          )
        );
        failCount++;
      }
    }

    setIsRunning(false);
    setCurrentIndex(-1);

    if (failCount === 0) {
      toast({
        title: `${successCount} ${successCount === 1 ? "file" : "files"} uploaded`,
        description: "All files have been encrypted and stored securely.",
      });
      setTimeout(() => handleClose(), 900);
    } else {
      toast({
        title: "Upload complete",
        description: `${successCount} succeeded · ${failCount} failed`,
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    if (isRunning) return;
    setQueue([]);
    setCurrentIndex(-1);
    onClose();
  };

  const buttonLabel = (() => {
    if (isRunning) {
      return `Uploading ${runIndex} of ${runTotal}…`;
    }
    if (pendingCount === 0 && errorCount > 0) return `Retry ${errorCount} failed`;
    const n = pendingCount;
    return `Upload ${n} ${n === 1 ? "file" : "files"}`;
  })();

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)] overflow-hidden glass-panel border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            Upload Files
          </DialogTitle>
        </DialogHeader>

        {/* Storage bar */}
        {usage && (
          <div className="space-y-1.5 px-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Storage used</span>
              <span className={`font-semibold ${pct >= 90 ? "text-red-400" : pct >= 75 ? "text-yellow-400" : "text-green-400"}`}>
                {formatBytes(used)} / {formatBytes(LIMIT)}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Always-mounted hidden input so openPicker works in both branches */}
        <div style={{ display: "none" }} aria-hidden="true">
          <input {...getInputProps()} />
        </div>

        {/* Storage full */}
        {isFull ? (
          <div className="mt-4 flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-red-400 mb-1">Storage limit reached</p>
              <p className="text-sm text-muted-foreground">
                You've used all {formatBytes(LIMIT)} of storage. Delete some files to free up space.
              </p>
            </div>
            <Button variant="ghost" onClick={handleClose}>Close</Button>
          </div>
        ) : queue.length === 0 ? (
          /* Drop zone — shown when queue is empty */
          <div
            {...getRootProps()}
            className={`
              mt-4 p-12 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200
              ${isDragActive ? "border-primary bg-primary/5 scale-[1.02]" : "border-white/10 hover:border-primary/50 hover:bg-white/5"}
            `}
          >
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <UploadCloud className={`w-8 h-8 ${isDragActive ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <p className="text-base font-semibold mb-1">
              {isDragActive ? "Drop them here!" : "Drag & drop your files"}
            </p>
            <p className="text-sm text-muted-foreground">
              or tap to browse — select as many as you like
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {formatBytes(remaining)} remaining
            </p>
          </div>
        ) : (
          /* File queue */
          <div className="mt-4 space-y-4">
            {/* Scrollable file list */}
            <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
              {queue.map((item) => {
                const isOverLimit = wouldExceedSet.has(item.id);
                const isActive = uploadingItem?.id === item.id;

                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      item.status === "done"
                        ? "bg-green-500/5 border-green-500/20"
                        : item.status === "error"
                        ? "bg-red-500/5 border-red-500/20"
                        : isActive
                        ? "bg-primary/5 border-primary/30"
                        : isOverLimit
                        ? "bg-yellow-500/5 border-yellow-500/20"
                        : "bg-white/5 border-white/10"
                    }`}
                  >
                    <div className="p-2 bg-card rounded-lg flex-shrink-0">
                      <FileIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(item.file.size)}
                        {item.status === "error" && item.errorMsg && (
                          <span className="text-red-400 ml-2">· {item.errorMsg}</span>
                        )}
                        {item.status === "pending" && isOverLimit && (
                          <span className="text-yellow-400 ml-2">· may exceed storage limit</span>
                        )}
                      </p>
                      {isActive && (
                        <Progress value={progress} className="h-1 mt-1.5" />
                      )}
                    </div>
                    {/* Status icon / remove button */}
                    {item.status === "done" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                    ) : item.status === "error" ? (
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    ) : item.status === "uploading" ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                    ) : (
                      !isRunning && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(item.id)}
                          className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add more button + total size */}
            {!isRunning && (
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <button
                  onClick={openPicker}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add more files
                </button>
                <span>
                  {queue.length} {queue.length === 1 ? "file" : "files"} · {formatBytes(totalQueueSize)}
                </span>
              </div>
            )}

            {/* Encrypt badge */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-accent/20 bg-accent/5 min-w-0">
              <div className="p-2 bg-accent/20 rounded-lg flex-shrink-0">
                <Lock className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="text-sm font-bold text-foreground">Encrypt Files</Label>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded whitespace-nowrap">Always On</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  AES-256-GCM encryption — only you can access your files
                </p>
              </div>
              <Switch checked={true} disabled={true} className="opacity-60 flex-shrink-0" />
            </div>

            {/* Security note */}
            {!isRunning && errorCount === 0 && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/10 text-xs text-primary/80">
                <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                <span className="break-words min-w-0">
                  All files are encrypted with AES-256-GCM before uploading to Cloudflare R2. Encryption cannot be disabled.
                </span>
              </div>
            )}

            {/* Error summary */}
            {!isRunning && errorCount > 0 && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  {errorCount} {errorCount === 1 ? "file" : "files"} failed.
                  {doneCount > 0 && ` ${doneCount} uploaded successfully.`}
                  {" "}Retry or remove failed files.
                </span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={handleClose} disabled={isRunning}>
                {isRunning ? "Uploading…" : "Cancel"}
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isRunning || !hasActionable}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {isRunning ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {buttonLabel}
                  </span>
                ) : buttonLabel}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
