import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderPlus, FolderOpen, ChevronRight } from "lucide-react";
import { useCreateFolder, useListFolders } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentId?: string | null;
}

export function CreateFolderModal({ isOpen, onClose, parentId }: CreateFolderModalProps) {
  const [name, setName] = useState("");
  const createFolder = useCreateFolder();
  const { data: foldersData } = useListFolders();
  const { toast } = useToast();

  const parentFolder = parentId
    ? foldersData?.folders?.find(f => f.id === parentId)
    : null;

  const handleCreate = () => {
    if (!name.trim()) return;
    createFolder.mutate(
      { name: name.trim(), parentId: parentId ?? null },
      {
        onSuccess: () => {
          toast({ title: "Folder created", description: `"${name.trim()}" created${parentFolder ? ` inside ${parentFolder.name}` : ""}.` });
          setName("");
          onClose();
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Could not create folder." });
        },
      }
    );
  };

  const handleClose = () => {
    if (createFolder.isPending) return;
    setName("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm glass-panel border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-primary" />
            New Folder
          </DialogTitle>
        </DialogHeader>

        {/* Context breadcrumb if inside a folder */}
        {parentFolder && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-white/5 rounded-lg px-3 py-2 border border-white/5">
            <FolderOpen className="w-3.5 h-3.5 text-yellow-500/70 flex-shrink-0" />
            <span className="truncate">Creating inside</span>
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
            <span className="font-semibold text-foreground/80 truncate">{parentFolder.name}</span>
          </div>
        )}

        <div className="py-1 space-y-2">
          <Label htmlFor="folder-name" className="text-sm text-muted-foreground">Folder name</Label>
          <Input
            id="folder-name"
            placeholder="Untitled folder"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
            className="bg-white/5 border-white/10 focus-visible:border-primary"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={createFolder.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createFolder.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {createFolder.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
