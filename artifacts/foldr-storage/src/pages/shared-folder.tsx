import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { HardDrive, FolderOpen, FileText, Image, Film, Download, Loader2, FolderX } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { formatBytes } from "@/lib/utils";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

interface SharedFolder {
  folder: { id: string; name: string; parentId: string | null; createdAt: string };
  files: Array<{ id: string; name: string; size: number; mimeType: string; cid: string; isEncrypted: boolean; storageBackend: string; createdAt: string }>;
  subFolders: Array<{ id: string; name: string; createdAt: string }>;
}

function MimeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("image/")) return <Image className={className} />;
  if (mimeType.startsWith("video/")) return <Film className={className} />;
  return <FileText className={className} />;
}

export default function SharedFolderPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<SharedFolder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    customFetch<SharedFolder>(`/api/shared-folder/${token}`, { method: "GET" })
      .then(setData)
      .catch((e: any) => setError(e?.message ?? "Shared folder not found"))
      .finally(() => setIsLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-white/5 bg-card/30 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <HardDrive className="w-6 h-6 text-primary" />
          <span className="text-xl font-display font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            foldr.storage
          </span>
          <span className="text-muted-foreground ml-2 text-sm">Shared Folder</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {isLoading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : error || !data ? (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
            <FolderX className="w-20 h-20 text-muted-foreground/30" />
            <div>
              <h2 className="text-xl font-bold">Folder not found</h2>
              <p className="text-muted-foreground mt-1">{error ?? "This shared folder link may have been removed."}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <FolderOpen className="w-8 h-8 text-yellow-500" />
                <h1 className="text-3xl font-bold">{data.folder.name}</h1>
              </div>
              <p className="text-muted-foreground text-sm">
                {data.files.length} file{data.files.length !== 1 ? "s" : ""} · Shared publicly
              </p>
            </div>

            {data.subFolders.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Folders</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {data.subFolders.map(sf => (
                    <div key={sf.id} className="p-4 rounded-xl border border-white/5 bg-card/20 flex items-center gap-2">
                      <FolderOpen className="w-5 h-5 text-yellow-500/70 flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{sf.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.files.length > 0 ? (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Files</h2>
                <div className="rounded-2xl border border-white/5 overflow-hidden bg-card/20">
                  <div className="grid grid-cols-[1fr_100px_120px_80px] gap-4 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-white/5 bg-white/[0.02]">
                    <span>Name</span>
                    <span>Size</span>
                    <span>Added</span>
                    <span></span>
                  </div>
                  {data.files.map(file => (
                    <div key={file.id} className="grid grid-cols-[1fr_100px_120px_80px] gap-4 items-center px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <MimeIcon mimeType={file.mimeType} className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{file.name}</span>
                        {file.isEncrypted && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold flex-shrink-0">ENC</span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">{formatBytes(file.size)}</span>
                      <span className="text-sm text-muted-foreground">{format(new Date(file.createdAt), "MMM d, yyyy")}</span>
                      {!file.isEncrypted ? (
                        <a
                          href={`https://gateway.lighthouse.storage/ipfs/${file.cid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <Button size="sm" variant="ghost" className="gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10">
                            <Download className="w-3.5 h-3.5" />
                            Open
                          </Button>
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">Encrypted</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>This folder is empty.</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground/40 text-center pt-4">
              Files served from IPFS via foldr.storage
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
