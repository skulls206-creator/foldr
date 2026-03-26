import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FolderOpen, FolderInput, Check, Home } from "lucide-react";
import type { Folder } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface MoveFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  currentFolderId?: string | null;
  fileCount: number;
  onMove: (targetFolderId: string | null) => Promise<void>;
}

export function MoveFolderModal({
  isOpen,
  onClose,
  folders,
  currentFolderId,
  fileCount,
  onMove,
}: MoveFolderModalProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined);
  const [isMoving, setIsMoving] = useState(false);

  const handleMove = async () => {
    if (selectedFolderId === undefined) return;
    setIsMoving(true);
    try {
      await onMove(selectedFolderId);
      onClose();
    } finally {
      setIsMoving(false);
      setSelectedFolderId(undefined);
    }
  };

  const handleClose = () => {
    if (isMoving) return;
    setSelectedFolderId(undefined);
    onClose();
  };

  const rootFolders = folders.filter(f => !f.parentId);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm glass-panel border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <FolderInput className="w-5 h-5 text-primary" />
            Move {fileCount} {fileCount === 1 ? "file" : "files"}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-1 max-h-72 overflow-y-auto pr-1">
          {/* Root option */}
          <button
            onClick={() => setSelectedFolderId(null)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors",
              selectedFolderId === null
                ? "bg-primary/15 border border-primary/30 text-primary"
                : "hover:bg-white/5 text-foreground/80 hover:text-foreground border border-transparent"
            )}
          >
            <Home className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium flex-1">Home (root)</span>
            {selectedFolderId === null && (
              <Check className="w-4 h-4 flex-shrink-0" />
            )}
          </button>

          {rootFolders.length > 0 && (
            <div className="my-1 border-t border-white/5" />
          )}

          {rootFolders.map(folder => {
            const isCurrentLocation = folder.id === currentFolderId;
            const isSelected = selectedFolderId === folder.id;
            return (
              <button
                key={folder.id}
                disabled={isCurrentLocation}
                onClick={() => setSelectedFolderId(folder.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors",
                  isSelected
                    ? "bg-primary/15 border border-primary/30 text-primary"
                    : isCurrentLocation
                    ? "opacity-40 cursor-not-allowed border border-transparent"
                    : "hover:bg-white/5 text-foreground/80 hover:text-foreground border border-transparent"
                )}
              >
                <FolderOpen className={cn("w-4 h-4 flex-shrink-0", isCurrentLocation ? "text-yellow-500/50" : "text-yellow-500/70")} />
                <span className="font-medium flex-1 truncate">{folder.name}</span>
                {isCurrentLocation && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">current</span>
                )}
                {isSelected && !isCurrentLocation && (
                  <Check className="w-4 h-4 flex-shrink-0" />
                )}
              </button>
            );
          })}

          {folders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No folders yet. Files will be moved to the root.
            </p>
          )}
        </div>

        <DialogFooter className="mt-4 flex gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={isMoving} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={selectedFolderId === undefined || isMoving}
            className="flex-1 gap-2"
          >
            {isMoving ? "Moving..." : "Move Here"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
