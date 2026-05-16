import { formatBytes } from "@/lib/utils";
import { format } from "date-fns";
import { Lock, MoreHorizontal } from "lucide-react";
import { FileIconDisplay } from "./file-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileContextMenu } from "./file-context-menu";
import { FileRightClickMenu } from "./file-right-click-menu";
import { getDensityClasses, type RowDensity } from "@/hooks/use-row-density";
import type { File } from "@workspace/api-client-react";

function getFileType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "Spreadsheet";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "Slides";
  if (mimeType.includes("document") || mimeType.includes("word") || mimeType.includes("text/plain")) return "Document";
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("compressed") || mimeType.includes("gzip") || mimeType.includes("rar") || mimeType.includes("7z")) return "Archive";
  if (mimeType.includes("json") || mimeType.includes("javascript") || mimeType.includes("typescript") || mimeType.includes("html") || mimeType.includes("css") || mimeType.includes("xml") || mimeType.includes("x-sh") || mimeType.includes("x-python")) return "Code";
  return "File";
}

interface FileListItemProps {
  file: File;
  isSelected?: boolean;
  isSelecting?: boolean;
  density?: RowDensity;
  onSelect?: (id: string, selected: boolean) => void;
  onPreview?: (file: File) => void;
  onRename?: (file: File) => void;
  onRefresh?: () => void;
  onShareLink: (file: File) => void;
  onShareEncrypted: (file: File) => void;
  onRevokeAccess: (file: File) => void;
  onTokenGate: (file: File) => void;
  onDelete: (file: File) => void;
  onStar?: (file: File) => void;
}

export function FileListItem({ 
  file,
  isSelected = false,
  isSelecting = false,
  density = "comfortable",
  onSelect,
  onPreview,
  onRename,
  onRefresh,
  onShareLink,
  onShareEncrypted,
  onRevokeAccess,
  onTokenGate,
  onDelete,
  onStar
}: FileListItemProps) {
  const dc = getDensityClasses(density);
  
  const handleDownload = () => {
    window.open(`${import.meta.env.BASE_URL}api/files/${file.id}/download`, '_blank');
  };

  const handleRowClick = () => {
    if (isSelecting && onSelect) {
      onSelect(file.id, !isSelected);
    }
  };

  const handleDoubleClick = () => {
    if (!isSelecting) {
      if (onPreview) onPreview(file);
      else handleDownload();
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("fileId", file.id);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <FileRightClickMenu
      file={file}
      onDownload={handleDownload}
      onPreview={onPreview ? () => onPreview(file) : undefined}
      onRename={onRename ? () => onRename(file) : undefined}
      onRefresh={onRefresh}
      onShareLink={() => onShareLink(file)}
      onShareEncrypted={() => onShareEncrypted(file)}
      onRevokeAccess={() => onRevokeAccess(file)}
      onTokenGate={() => onTokenGate(file)}
      onDelete={() => onDelete(file)}
      onStar={onStar ? () => onStar(file) : undefined}
    >
    <div
      draggable={!isSelecting}
      onDragStart={handleDragStart}
      className={`
        group flex items-center justify-between ${dc.rowPy} transition-colors duration-100 cursor-pointer
        ${isSelected ? "bg-primary/[0.08]" : "hover:bg-white/[0.03]"}
      `}
      onClick={handleRowClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className={`flex items-center ${dc.gap} flex-1 min-w-0`}>
        {/* Checkbox */}
        {onSelect && (
          <div
            className={`flex-shrink-0 transition-opacity ${isSelected || isSelecting ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            onClick={e => { e.stopPropagation(); onSelect(file.id, !isSelected); }}
          >
            <Checkbox
              checked={isSelected}
              className="border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>
        )}

        {/* Icon */}
        <div className={`relative ${dc.iconWrap} rounded-md bg-white/5 flex-shrink-0`}>
          <FileIconDisplay mimeType={file.mimeType} className={dc.iconSize} />
          {file.isEncrypted && (
            <div className="absolute -bottom-0.5 -right-0.5 bg-accent p-0.5 rounded-full border border-background">
              <Lock className="w-2 h-2 text-white" />
            </div>
          )}
        </div>
        
        {/* Name + mobile subtitle */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block text-foreground/85">{file.name}</span>
          {/* Show date + size below name on mobile, since right columns are hidden */}
          <span className="text-[11px] text-muted-foreground/50 sm:hidden block truncate mt-0.5">
            {formatBytes(file.size)} <span className="mx-1">·</span> {format(new Date(file.createdAt), 'MMM d, yyyy')}
          </span>
        </div>
      </div>

      {/* Right fixed columns */}
      <div className="flex items-center flex-shrink-0">
        <div className="w-20 text-right hidden sm:block">
          <span className="text-xs text-muted-foreground/70">{formatBytes(file.size)}</span>
        </div>

        <div className="w-32 text-right hidden sm:block">
          <span className="text-xs text-muted-foreground/70">{format(new Date(file.createdAt), 'MMM d, yyyy')}</span>
        </div>

        <div className="w-20 text-right hidden sm:block">
          <span className="text-[11px] text-muted-foreground/50 uppercase tracking-wide">
            {getFileType(file.mimeType)}
          </span>
        </div>
        
        <div className="w-8 flex justify-end flex-shrink-0">
          {!isSelecting && (
            <FileContextMenu 
              file={file}
              onDownload={handleDownload}
              onPreview={onPreview ? () => onPreview(file) : undefined}
              onRename={onRename ? () => onRename(file) : undefined}
              onRefresh={onRefresh}
              onShareLink={() => onShareLink(file)}
              onShareEncrypted={() => onShareEncrypted(file)}
              onRevokeAccess={() => onRevokeAccess(file)}
              onTokenGate={() => onTokenGate(file)}
              onDelete={() => onDelete(file)}
            >
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </FileContextMenu>
          )}
        </div>
      </div>
    </div>
    </FileRightClickMenu>
  );
}
