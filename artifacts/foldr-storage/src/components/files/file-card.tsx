import { formatBytes } from "@/lib/utils";
import { format } from "date-fns";
import { Lock, HardDrive, MoreVertical, Star } from "lucide-react";
import { FileIconDisplay } from "./file-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileContextMenu } from "./file-context-menu";
import { FileRightClickMenu } from "./file-right-click-menu";
import type { File } from "@workspace/api-client-react";

interface FileCardProps {
  file: File;
  isSelected?: boolean;
  isSelecting?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onRefresh?: () => void;
  onShareLink: (file: File) => void;
  onShareEncrypted: (file: File) => void;
  onRevokeAccess: (file: File) => void;
  onTokenGate: (file: File) => void;
  onDelete: (file: File) => void;
  onStar?: (file: File) => void;
}

export function FileCard({ 
  file,
  isSelected = false,
  isSelecting = false,
  onSelect,
  onRefresh,
  onShareLink,
  onShareEncrypted,
  onRevokeAccess,
  onTokenGate,
  onDelete,
  onStar
}: FileCardProps) {
  
  const handleDownload = () => {
    window.open(`/api/files/${file.id}/download`, '_blank');
  };

  const handleCardClick = () => {
    if (isSelecting && onSelect) {
      onSelect(file.id, !isSelected);
    }
  };

  return (
    <FileRightClickMenu
      file={file}
      onDownload={handleDownload}
      onRefresh={onRefresh}
      onShareLink={() => onShareLink(file)}
      onShareEncrypted={() => onShareEncrypted(file)}
      onRevokeAccess={() => onRevokeAccess(file)}
      onTokenGate={() => onTokenGate(file)}
      onDelete={() => onDelete(file)}
      onStar={onStar ? () => onStar(file) : undefined}
    >
    <div
      className={`
        relative group rounded-2xl p-6 sm:p-5 transition-all duration-300 cursor-pointer
        ${isSelected
          ? "bg-primary/10 border border-primary/30 shadow-lg shadow-primary/10"
          : file.isEncrypted ? "glass-panel-accent" : "glass-panel"
        }
        ${!isSelected ? "hover:-translate-y-1 hover:shadow-xl" : ""}
      `}
      onClick={handleCardClick}
    >
      {/* Checkbox — top-left, visible on hover or when selecting */}
      {onSelect && (
        <div
          className={`absolute top-3 left-3 z-10 transition-opacity ${isSelected || isSelecting ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          onClick={e => { e.stopPropagation(); onSelect(file.id, !isSelected); }}
        >
          <Checkbox
            checked={isSelected}
            className="border-white/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary bg-background/60 backdrop-blur"
          />
        </div>
      )}

      {/* Star button — only when NOT selecting */}
      {onStar && !isSelecting && (
        <button
          onClick={(e) => { e.stopPropagation(); onStar(file); }}
          className={`absolute top-3 ${onSelect ? "left-9" : "left-3"} transition-opacity ${file.isStarred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          title={file.isStarred ? "Remove star" : "Star file"}
        >
          <Star className={`w-4 h-4 ${file.isStarred ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`} />
        </button>
      )}

      {/* Context menu — only when NOT selecting */}
      {!isSelecting && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <FileContextMenu 
            file={file}
            onDownload={handleDownload}
            onRefresh={onRefresh}
            onShareLink={() => onShareLink(file)}
            onShareEncrypted={() => onShareEncrypted(file)}
            onRevokeAccess={() => onRevokeAccess(file)}
            onTokenGate={() => onTokenGate(file)}
            onDelete={() => onDelete(file)}
          >
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-background/50 backdrop-blur hover:bg-background/80">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </FileContextMenu>
        </div>
      )}

      <div className="flex flex-col items-center text-center gap-4" onDoubleClick={handleDownload}>
        <div className="relative p-5 sm:p-4 rounded-xl bg-white/5 border border-white/5 group-hover:scale-105 transition-transform duration-300 overflow-hidden">
          {(file as any).thumbnailCid ? (
            <img
              src={`/api/files/${file.id}/thumbnail`}
              alt={file.name}
              className="w-14 h-14 object-cover rounded-lg"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <FileIconDisplay mimeType={file.mimeType} className="w-14 h-14" />
          )}
          {file.isEncrypted && (
            <div className="absolute -bottom-2 -right-2 bg-accent p-1.5 rounded-full shadow-lg shadow-accent/50 border border-background">
              <Lock className="w-3 h-3 text-white" />
            </div>
          )}
        </div>

        <div className="w-full space-y-1">
          <h3 className="font-semibold text-sm truncate text-foreground/90 group-hover:text-foreground transition-colors" title={file.name}>
            {file.name}
          </h3>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>{formatBytes(file.size)}</span>
            <span>•</span>
            <span>{format(new Date(file.createdAt), 'MMM d, yyyy')}</span>
            <span>•</span>
            <span className="text-muted-foreground/60">{format(new Date(file.createdAt), 'h:mm a')}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-2">
          <HardDrive className="w-3 h-3" />
          {file.storageBackend}
        </div>
      </div>
    </div>
    </FileRightClickMenu>
  );
}
