import { useState, useEffect } from "react";
import { X, Download, Clock, FileText, Image as ImageIcon, Film, ExternalLink, Shield, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFileVersions, useRestoreFileVersion } from "@workspace/api-client-react";
import type { File } from "@workspace/api-client-react";
import { formatBytes, apiUrl } from "@/lib/utils";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface PreviewPanelProps {
  file: File | null;
  onClose: () => void;
}

function getMimeCategory(mimeType: string): "image" | "video" | "text" | "pdf" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml") return "text";
  return "other";
}

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const cat = getMimeCategory(mimeType);
  if (cat === "image") return <ImageIcon className={className} />;
  if (cat === "video") return <Film className={className} />;
  return <FileText className={className} />;
}

function TextPreview({ src }: { src: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setText(null);
    setError(false);
    fetch(src)
      .then(r => r.text())
      .then(t => setText(t.slice(0, 50_000)))
      .catch(() => setError(true));
  }, [src]);

  if (error) return <p className="text-muted-foreground text-sm">Could not load preview.</p>;
  if (text === null) return <p className="text-muted-foreground text-sm animate-pulse">Loading preview…</p>;

  return (
    <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-all font-mono leading-relaxed">
      {text}
    </pre>
  );
}

function VersionsSection({ fileId }: { fileId: string }) {
  const { data, refetch } = useFileVersions(fileId);
  const restore = useRestoreFileVersion();
  const { toast } = useToast();
  const versions = data?.versions ?? [];

  if (versions.length === 0) return null;

  const handleRestore = (versionId: string) => {
    restore.mutate({ fileId, versionId }, {
      onSuccess: () => {
        toast({ title: "Version restored", description: "The file has been restored to the selected version." });
        refetch();
      },
      onError: (e: any) => {
        toast({ variant: "destructive", title: "Restore failed", description: e?.message ?? "Could not restore version." });
      },
    });
  };

  return (
    <div className="border-t border-white/5 pt-4 mt-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1">
        <Clock className="w-3.5 h-3.5" /> Version History
      </p>
      <div className="space-y-2">
        {versions.map((v, i) => (
          <div key={v.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-white/5 group">
            <div className="flex items-center gap-2">
              <span className="font-mono text-muted-foreground">v{v.versionNumber}</span>
              <span className="text-muted-foreground">{formatBytes(v.size)}</span>
              {i === 0 && (
                <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-semibold">Current</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground/60">{format(new Date(v.createdAt), "MMM d, h:mm a")}</span>
              {i > 0 && (
                <button
                  onClick={() => handleRestore(v.id)}
                  disabled={restore.isPending}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary/80"
                  title="Restore this version"
                >
                  {restore.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PreviewPanel({ file, onClose }: PreviewPanelProps) {
  if (!file) return null;

  const cat = getMimeCategory(file.mimeType);
  const downloadUrl = `${apiUrl()}/api/files/${file.id}/download`;

  return (
    <div className="w-80 flex-shrink-0 bg-card/40 border-l border-white/5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon mimeType={file.mimeType} className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium truncate">{file.name}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-2 flex-shrink-0 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Preview area */}
          <div className="rounded-xl overflow-hidden bg-black/20 border border-white/5 min-h-32 flex items-center justify-center">
            {cat === "image" && !file.isEncrypted && (
              <img
                src={downloadUrl}
                alt={file.name}
                className="max-w-full max-h-64 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            {cat === "video" && !file.isEncrypted && (
              <video
                src={downloadUrl}
                controls
                className="max-w-full max-h-64"
              />
            )}
            {cat === "text" && !file.isEncrypted && (
              <div className="w-full p-3 max-h-64 overflow-auto">
                <TextPreview src={downloadUrl} />
              </div>
            )}
            {cat === "pdf" && !file.isEncrypted && (
              <div className="w-full space-y-2">
                <iframe
                  src={downloadUrl}
                  className="w-full h-48 rounded border-0"
                  title={file.name}
                />
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline px-3"
                >
                  Open in new tab <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {(cat === "other" || file.isEncrypted) && (
              <div className="text-center py-6 space-y-2">
                {file.isEncrypted ? (
                  <Shield className="w-12 h-12 text-primary/50 mx-auto" />
                ) : (
                  <FileIcon mimeType={file.mimeType} className="w-12 h-12 text-muted-foreground mx-auto" />
                )}
                <p className="text-xs text-muted-foreground">
                  {file.isEncrypted ? "Encrypted — download to view" : "No preview available"}
                </p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center py-1 border-b border-white/5">
              <span className="text-muted-foreground">Size</span>
              <span className="font-medium">{formatBytes(file.size)}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-white/5">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium truncate max-w-36 text-right">{file.mimeType}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-white/5">
              <span className="text-muted-foreground">Encrypted</span>
              <span className={`font-medium ${file.isEncrypted ? "text-primary" : "text-muted-foreground"}`}>
                {file.isEncrypted ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-white/5">
              <span className="text-muted-foreground">Network</span>
              <span className="font-medium capitalize">{file.storageBackend}</span>
            </div>
            <div className="flex justify-between items-start py-1 border-b border-white/5">
              <span className="text-muted-foreground">CID</span>
              <span className="font-mono text-xs text-right max-w-40 break-all opacity-60">{file.cid.slice(0, 20)}…</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-white/5">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium text-right">{format(new Date(file.createdAt), "MMM d, yyyy")}</span>
            </div>
          </div>

          {/* Download */}
          <a href={downloadUrl} download={file.name}>
            <Button className="w-full" variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </a>

          {/* Versions */}
          <VersionsSection fileId={file.id} />
        </div>
      </ScrollArea>
    </div>
  );
}
