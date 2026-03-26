import { useState } from "react";
import { useLocation } from "wouter";
import { Trash2, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useGetMe,
  useListFolders,
  useListTrash,
  useRestoreFile,
  useEmptyTrash,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { formatBytes } from "@/lib/utils";
import { format } from "date-fns";

export default function TrashPage() {
  const [, setLocation] = useLocation();
  const [currentFilter, setCurrentFilter] = useState("deleted");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [isEmptyTrashAlertOpen, setIsEmptyTrashAlertOpen] = useState(false);

  const { data: user, error: authError } = useGetMe();
  const { data: foldersData } = useListFolders();
  const { data: trashData, isLoading } = useListTrash();
  const restoreMutation = useRestoreFile();
  const emptyTrashMutation = useEmptyTrash();
  const { toast } = useToast();

  if (authError) {
    setLocation("/login");
    return null;
  }

  const files = trashData?.files ?? [];
  const filteredFiles = searchQuery
    ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : files;

  const handleRestore = (id: string, name: string) => {
    restoreMutation.mutate({ id }, {
      onSuccess: () => toast({ title: "Restored", description: `"${name}" restored from trash.` }),
      onError: () => toast({ variant: "destructive", title: "Failed", description: "Could not restore file." }),
    });
  };

  const handleEmptyTrash = () => {
    emptyTrashMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast({ title: "Trash emptied", description: `${data.deleted} file${data.deleted !== 1 ? "s" : ""} permanently deleted.` });
        setIsEmptyTrashAlertOpen(false);
      },
      onError: () => toast({ variant: "destructive", title: "Failed", description: "Could not empty trash." }),
    });
  };

  return (
    <AppLayout
      currentFilter={currentFilter}
      onFilterChange={f => { setCurrentFilter(f); if (f !== "deleted") setLocation("/"); }}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      folders={foldersData?.folders}
      onFolderClick={() => setLocation("/")}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trash2 className="w-6 h-6 text-destructive" />
              Trash
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {files.length} item{files.length !== 1 ? "s" : ""} in trash
            </p>
          </div>
          {files.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => setIsEmptyTrashAlertOpen(true)}
              disabled={emptyTrashMutation.isPending}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Empty Trash
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4 text-center">
            <Trash2 className="w-16 h-16 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-medium text-muted-foreground">Trash is empty</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Files you delete will appear here.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/5 overflow-hidden bg-card/20">
            <div className="grid grid-cols-[1fr_100px_120px_80px] gap-4 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-white/5 bg-white/[0.02]">
              <span>Name</span>
              <span>Size</span>
              <span>Deleted</span>
              <span></span>
            </div>
            {filteredFiles.map(file => (
              <div
                key={file.id}
                className="grid grid-cols-[1fr_100px_120px_80px] gap-4 items-center px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Trash2 className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{file.name}</span>
                </div>
                <span className="text-sm text-muted-foreground">{formatBytes(file.size)}</span>
                <span className="text-sm text-muted-foreground">
                  {format(new Date(file.updatedAt), "MMM d, yyyy")}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRestore(file.id, file.name)}
                  disabled={restoreMutation.isPending}
                  className="gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={isEmptyTrashAlertOpen} onOpenChange={setIsEmptyTrashAlertOpen}>
        <AlertDialogContent className="bg-card border-white/10 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Empty trash permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {files.length} file{files.length !== 1 ? "s" : ""} in trash.
              Files stored on IPFS cannot be recovered after deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEmptyTrash}
              className="bg-destructive hover:bg-destructive/90"
            >
              {emptyTrashMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Empty Trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
