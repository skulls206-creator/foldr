import { useState } from "react";
import { 
  Download, 
  ExternalLink, 
  Star, 
  StarOff, 
  Trash2, 
  FolderInput, 
  X, 
  CheckSquare,
  Loader2,
  Archive
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useBulkDownloadFiles } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface BulkActionBarProps {
  selectedCount: number;
  selectedFileIds: string[];
  selectedFolderIds: string[];
  allFilesStarred: boolean;
  onClearSelection: () => void;
  onDownloadAll: () => void;
  onOpenAll: () => void;
  onStarAll: (star: boolean) => Promise<void>;
  onDeleteAll: () => void;
  onMoveAll: () => void;
  /** inline = embedded in the page header (desktop); floating = fixed bottom bar (mobile/tablet) */
  variant?: "floating" | "inline";
}

export function BulkActionBar({
  selectedCount,
  selectedFileIds,
  selectedFolderIds,
  allFilesStarred,
  onClearSelection,
  onDownloadAll,
  onOpenAll,
  onStarAll,
  onDeleteAll,
  onMoveAll,
  variant = "floating",
}: BulkActionBarProps) {
  const [isStarring, setIsStarring] = useState(false);
  const { toast } = useToast();
  const bulkDownload = useBulkDownloadFiles();

  if (selectedCount === 0) return null;

  const hasFiles = selectedFileIds.length > 0;
  const hasFolders = selectedFolderIds.length > 0;

  const handleStar = async () => {
    setIsStarring(true);
    try {
      await onStarAll(!allFilesStarred);
    } finally {
      setIsStarring(false);
    }
  };

  const inner = (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-card/95 border border-white/10 shadow-2xl shadow-black/50 backdrop-blur-md">
      {/* Selection count */}
      <div className="flex items-center gap-2 pr-3 border-r border-white/10">
        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
          <CheckSquare className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <span className="text-sm font-semibold whitespace-nowrap">
          {selectedCount} selected
        </span>
        {hasFolders && hasFiles && (
          <span className="text-xs text-muted-foreground hidden md:inline">
            ({selectedFileIds.length}f + {selectedFolderIds.length} folders)
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {hasFiles && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDownloadAll}
                  className="gap-2 text-sm h-9 px-3 hover:bg-white/10 hover:text-foreground"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Download</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download all selected files</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    bulkDownload.mutate({ ids: selectedFileIds }, {
                      onError: () => toast({ variant: "destructive", title: "Download failed", description: "Could not create ZIP archive." }),
                    });
                  }}
                  disabled={bulkDownload.isPending}
                  className="gap-2 text-sm h-9 px-3 hover:bg-white/10 hover:text-foreground"
                >
                  {bulkDownload.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                  <span className="hidden sm:inline">ZIP</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download selected as ZIP archive</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenAll}
                  className="gap-2 text-sm h-9 px-3 hover:bg-white/10 hover:text-foreground"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="hidden sm:inline">Open All</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open all files in new tabs</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStar}
                  disabled={isStarring}
                  className="gap-2 text-sm h-9 px-3 hover:bg-white/10 hover:text-yellow-400"
                >
                  {isStarring ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : allFilesStarred ? (
                    <StarOff className="w-4 h-4 text-yellow-400" />
                  ) : (
                    <Star className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{allFilesStarred ? "Unstar" : "Star"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{allFilesStarred ? "Remove star from all" : "Star all selected"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMoveAll}
                  className="gap-2 text-sm h-9 px-3 hover:bg-white/10 hover:text-foreground"
                >
                  <FolderInput className="w-4 h-4" />
                  <span className="hidden sm:inline">Move</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move selected files to a folder</TooltipContent>
            </Tooltip>
          </>
        )}

        <div className="w-px h-5 bg-white/10 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeleteAll}
              className="gap-2 text-sm h-9 px-3 hover:bg-destructive/20 hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete all selected</TooltipContent>
        </Tooltip>
      </div>

      <div className="w-px h-5 bg-white/10 ml-1" />

      {/* Close */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearSelection}
            className="h-8 w-8 ml-1 text-muted-foreground hover:text-foreground hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Clear selection</TooltipContent>
      </Tooltip>
    </div>
  );

  if (variant === "inline") {
    return (
      <TooltipProvider>
        {inner}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
        {inner}
      </div>
    </TooltipProvider>
  );
}
