import { useRoute } from "wouter";
import { useGetSharedFile } from "@workspace/api-client-react";
import { HardDrive, Download, AlertCircle, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { format } from "date-fns";
import { FileIconDisplay } from "@/components/files/file-icon";
import { Button } from "@/components/ui/button";

export default function SharePage() {
  const [match, params] = useRoute("/share/:token");
  const token = params?.token || "";

  const { data, isLoading, error } = useGetSharedFile(token, {
    query: {
      enabled: !!token,
      retry: false
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex justify-center items-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 text-center">
        <AlertCircle className="w-16 h-16 text-destructive mb-6" />
        <h1 className="text-3xl font-display font-bold mb-2">Link Expired or Invalid</h1>
        <p className="text-muted-foreground max-w-md">
          This public share link may have expired or been removed by the owner.
        </p>
      </div>
    );
  }

  const { file, downloadUrl } = data;

  return (
    <div className="min-h-screen w-full bg-background flex flex-col relative overflow-hidden">
      {/* Decorative bg */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />

      <header className="p-6 flex justify-between items-center z-10 border-b border-white/5">
        <div className="flex items-center gap-2">
          <HardDrive className="w-6 h-6 text-primary" />
          <span className="font-display font-bold text-xl tracking-tight text-primary">FOLDR</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 z-10">
        <div className="w-full max-w-lg glass-panel p-8 rounded-3xl text-center flex flex-col items-center">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 mb-6 shadow-xl">
            <FileIconDisplay mimeType={file.mimeType} className="w-20 h-20" />
          </div>

          <h2 className="text-2xl font-bold mb-2 truncate w-full px-4" title={file.name}>
            {file.name}
          </h2>
          
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8">
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">{formatBytes(file.size)}</span>
            <span>•</span>
            <span>Shared on {format(new Date(), 'MMM d, yyyy')}</span>
          </div>

          <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="w-full block">
            <Button className="w-full h-14 rounded-xl text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
              <Download className="w-5 h-5 mr-2" />
              Download File
            </Button>
          </a>
          
          <p className="mt-6 text-xs text-muted-foreground/50">
            Powered by IPFS & Filecoin decentralized storage.
          </p>
        </div>
      </main>
    </div>
  );
}
