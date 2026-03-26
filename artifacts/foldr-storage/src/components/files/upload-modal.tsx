import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { UploadCloud, X, Lock, File as FileIcon, ShieldCheck, AlertTriangle } from "lucide-react";
import { useUploadWithProgress } from "@/hooks/use-upload";
import { useStorageUsage } from "@workspace/api-client-react";
import { formatBytes } from "@/lib/utils";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId?: string | null;
}

export function UploadModal({ isOpen, onClose, folderId }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const { upload, progress, isUploading } = useUploadWithProgress();
  const { data: usage } = useStorageUsage();

  const LIMIT = usage?.limitBytes ?? 100 * 1024 * 1024;
  const used = usage?.usedBytes ?? 0;
  const remaining = Math.max(0, LIMIT - used);
  const isFull = used >= LIMIT;
  const wouldExceed = file ? (used + file.size > LIMIT) : false;

  const pct = Math.min(100, (used / LIMIT) * 100);
  const barColor =
    pct >= 90 ? "bg-red-500" :
    pct >= 75 ? "bg-yellow-500" :
    "bg-green-500";

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    multiple: false,
    disabled: isUploading || isFull,
  });

  const handleUpload = async () => {
    if (!file) return;
    try {
      await upload(file, true, folderId ?? undefined);
      setTimeout(() => {
        handleClose();
      }, 1000);
    } catch (e) {
      // Error handled in hook via toast
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    setFile(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)] overflow-hidden glass-panel border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            Upload File
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

        {isFull ? (
          <div className="mt-4 flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-red-400 mb-1">Storage limit reached</p>
              <p className="text-sm text-muted-foreground">
                You've used all 100 MB of storage. Delete some files to free up space.
              </p>
            </div>
            <Button variant="ghost" onClick={handleClose}>Close</Button>
          </div>
        ) : !file ? (
          <div 
            {...getRootProps()} 
            className={`
              mt-4 p-12 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200
              ${isDragActive ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-white/10 hover:border-primary/50 hover:bg-white/5'}
            `}
          >
            <input {...getInputProps()} />
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <UploadCloud className={`w-8 h-8 ${isDragActive ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <p className="text-base font-semibold mb-1">
              {isDragActive ? "Drop it here!" : "Drag & drop your file"}
            </p>
            <p className="text-sm text-muted-foreground">
              or click to browse from your computer
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {formatBytes(remaining)} remaining
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {wouldExceed && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  This file ({formatBytes(file.size)}) exceeds your remaining storage ({formatBytes(remaining)}). Delete some files first.
                </span>
              </div>
            )}

            {/* File row — name is clamped with truncate, X button never moves */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10 min-w-0">
              <div className="p-2.5 bg-card rounded-lg flex-shrink-0">
                <FileIcon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" title={file.name}>{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              {!isUploading && (
                <Button variant="ghost" size="icon" onClick={() => setFile(null)} className="h-7 w-7 flex-shrink-0 ml-auto text-muted-foreground hover:text-destructive">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Encrypt row — left side shrinks, switch stays pinned right */}
            <div className="flex items-center gap-3 p-4 rounded-xl border border-accent/20 bg-accent/5 min-w-0">
              <div className="p-2 bg-accent/20 rounded-lg flex-shrink-0">
                <Lock className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label htmlFor="encrypt" className="text-sm font-bold text-foreground">
                    Encrypt File
                  </Label>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded whitespace-nowrap">Always On</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  On-chain encryption via Kavach — only you can access this file
                </p>
              </div>
              <Switch
                id="encrypt"
                checked={true}
                disabled={true}
                className="opacity-60 flex-shrink-0"
              />
            </div>

            {!wouldExceed && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/10 text-xs text-primary/80">
                <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                <span className="break-words min-w-0">
                  All files are encrypted with Kavach protocol before uploading to IPFS — fully decentralized and non-custodial. Encryption cannot be disabled.
                </span>
              </div>
            )}

            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground font-medium">
                  <span>Uploading...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="ghost" onClick={handleClose} disabled={isUploading}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpload} 
                disabled={isUploading || wouldExceed}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {isUploading ? "Uploading..." : "Start Upload"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
