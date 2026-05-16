import { FolderOpen, MoreHorizontal, Trash2, ChevronRight, Pencil, Share2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { formatBytes } from "@/lib/utils";
import { getDensityClasses, type RowDensity } from "@/hooks/use-row-density";
import type { Folder } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface FolderRowProps {
  folder: Folder;
  isSelected: boolean;
  isSelecting: boolean;
  density?: RowDensity;
  onSelect: (id: string, selected: boolean) => void;
  onClick: (folderId: string) => void;
  onDelete: (folder: Folder) => void;
  onRename?: (folder: Folder) => void;
  onShare?: (folder: Folder) => void;
  onRefresh?: () => void;
  onDrop?: (targetFolderId: string, fileId: string) => void;
}

export function FolderRow({ folder, isSelected, isSelecting, density = "comfortable", onSelect, onClick, onDelete, onRename, onShare, onRefresh, onDrop }: FolderRowProps) {
  const totalSize = (folder as any).totalSize ?? 0;
  const dc = getDensityClasses(density);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("ring-2", "ring-primary/50", "bg-primary/5");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("ring-2", "ring-primary/50", "bg-primary/5");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring-2", "ring-primary/50", "bg-primary/5");
    const fileId = e.dataTransfer.getData("fileId");
    if (fileId && onDrop) onDrop(folder.id, fileId);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <div
      className={`
        group flex items-center justify-between ${dc.rowPy} transition-colors duration-100 cursor-pointer select-none
        ${isSelected ? "bg-primary/[0.08]" : "hover:bg-white/[0.03]"}
      `}
      onClick={() => {
        if (isSelecting) {
          onSelect(folder.id, !isSelected);
        } else {
          onClick(folder.id);
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* LEFT: checkbox + star-spacer + icon + name */}
      <div className={`flex items-center ${dc.gap} flex-1 min-w-0`}>
        {/* Checkbox */}
        <div
          className={`flex-shrink-0 transition-opacity ${isSelected || isSelecting ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          onClick={e => { e.stopPropagation(); onSelect(folder.id, !isSelected); }}
        >
          <Checkbox
            checked={isSelected}
            className="border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
        </div>

        {/* Folder icon */}
        <div className={`flex-shrink-0 ${density === "comfortable" ? "p-2 sm:p-1.5" : dc.iconWrap} rounded-md bg-yellow-500/10`}>
          <FolderOpen className={`${density === "comfortable" ? "w-5 h-5 sm:w-4 sm:h-4" : dc.iconSize} text-yellow-400`} />
        </div>

        {/* Name + mobile subtitle */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm text-foreground/85 truncate block">{folder.name}</span>
          <span className="text-[11px] text-muted-foreground/50 sm:hidden block truncate mt-0.5">
            {formatBytes(totalSize)} <span className="mx-1">·</span> Folder
          </span>
        </div>
      </div>

      {/* RIGHT: fixed columns matching FileListItem */}
      <div className="flex items-center pl-4 flex-shrink-0">
        <div className="w-20 text-right hidden sm:block">
          <span className="text-xs text-muted-foreground/70">{formatBytes(totalSize)}</span>
        </div>

        <div className="w-32 text-right hidden sm:block">
          <span className="text-xs text-muted-foreground/70">{format(new Date(folder.createdAt), "MMM d, yyyy")}</span>
        </div>

        <div className="w-20 text-right hidden sm:block">
          <span className="text-[11px] text-muted-foreground/50 uppercase tracking-wide">Folder</span>
        </div>

        <div className="w-8 flex justify-end flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-foreground"
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-white/10">
              <DropdownMenuItem
                onClick={e => { e.stopPropagation(); onClick(folder.id); }}
                className="gap-2"
              >
                <ChevronRight className="w-4 h-4" /> Open folder
              </DropdownMenuItem>
              {onRename && (
                <DropdownMenuItem
                  onClick={e => { e.stopPropagation(); onRename(folder); }}
                  className="gap-2"
                >
                  <Pencil className="w-4 h-4" /> Rename
                </DropdownMenuItem>
              )}
              {onShare && (
                <DropdownMenuItem
                  onClick={e => { e.stopPropagation(); onShare(folder); }}
                  className="gap-2"
                >
                  <Share2 className="w-4 h-4" /> Share folder
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-white/5" />
              <DropdownMenuItem
                onClick={e => { e.stopPropagation(); onDelete(folder); }}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4" /> Delete folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52 bg-card border-white/10 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <ContextMenuLabel className="text-foreground/70 text-xs font-normal truncate">{folder.name}</ContextMenuLabel>
        <ContextMenuSeparator className="bg-white/8" />
        <ContextMenuItem onClick={() => onClick(folder.id)} className="gap-2 cursor-pointer">
          <ChevronRight className="w-4 h-4" /> Open folder
        </ContextMenuItem>
        {onRename && (
          <ContextMenuItem onClick={() => onRename(folder)} className="gap-2 cursor-pointer">
            <Pencil className="w-4 h-4" /> Rename
          </ContextMenuItem>
        )}
        {onShare && (
          <ContextMenuItem onClick={() => onShare(folder)} className="gap-2 cursor-pointer">
            <Share2 className="w-4 h-4" /> Share folder
          </ContextMenuItem>
        )}
        <ContextMenuSeparator className="bg-white/8" />
        {onRefresh && (
          <ContextMenuItem onClick={onRefresh} className="gap-2 cursor-pointer">
            <RotateCw className="w-4 h-4" /> Refresh
          </ContextMenuItem>
        )}
        {onRefresh && (
          <>
            <ContextMenuSeparator className="bg-white/8" />
            <ContextMenuItem onClick={onRefresh} className="gap-2 cursor-pointer">
              <RotateCw className="w-4 h-4" /> Refresh
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator className="bg-white/8" />
        <ContextMenuItem
          onClick={() => onDelete(folder)}
          className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" /> Delete folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// Grid card version
interface FolderCardProps {
  folder: Folder;
  isSelected: boolean;
  isSelecting: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onClick: (folderId: string) => void;
  onDelete: (folder: Folder) => void;
  onRename?: (folder: Folder) => void;
  onShare?: (folder: Folder) => void;
  onRefresh?: () => void;
  onDrop?: (targetFolderId: string, fileId: string) => void;
}

export function FolderCard({ folder, isSelected, isSelecting, onSelect, onClick, onDelete, onRename, onShare, onRefresh, onDrop }: FolderCardProps) {
  const totalSize = (folder as any).totalSize ?? 0;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("ring-2", "ring-primary/50");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("ring-2", "ring-primary/50");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring-2", "ring-primary/50");
    const fileId = e.dataTransfer.getData("fileId");
    if (fileId && onDrop) onDrop(folder.id, fileId);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <div
      className={`
        relative group rounded-2xl p-6 sm:p-5 transition-all duration-300 cursor-pointer select-none
        ${isSelected ? "bg-primary/10 border border-primary/30 shadow-lg shadow-primary/10" : "glass-panel hover:-translate-y-1 hover:shadow-xl"}
      `}
      onClick={() => {
        if (isSelecting) {
          onSelect(folder.id, !isSelected);
        } else {
          onClick(folder.id);
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Checkbox */}
      <div
        className={`absolute top-3 left-3 transition-opacity z-10 ${isSelected || isSelecting ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        onClick={e => { e.stopPropagation(); onSelect(folder.id, !isSelected); }}
      >
        <Checkbox
          checked={isSelected}
          className="border-white/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary bg-background/60 backdrop-blur"
        />
      </div>

      {/* Actions menu */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-background/50 backdrop-blur hover:bg-background/80"
              onClick={e => e.stopPropagation()}
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-white/10">
            <DropdownMenuItem
              onClick={e => { e.stopPropagation(); onClick(folder.id); }}
              className="gap-2"
            >
              <ChevronRight className="w-4 h-4" /> Open folder
            </DropdownMenuItem>
            {onRename && (
              <DropdownMenuItem
                onClick={e => { e.stopPropagation(); onRename(folder); }}
                className="gap-2"
              >
                <Pencil className="w-4 h-4" /> Rename
              </DropdownMenuItem>
            )}
            {onShare && (
              <DropdownMenuItem
                onClick={e => { e.stopPropagation(); onShare(folder); }}
                className="gap-2"
              >
                <Share2 className="w-4 h-4" /> Share folder
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-white/5" />
            <DropdownMenuItem
              onClick={e => { e.stopPropagation(); onDelete(folder); }}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4" /> Delete folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col items-center text-center gap-4">
        <div className="relative p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 group-hover:scale-105 transition-transform duration-300">
          <FolderOpen className="w-14 h-14 text-yellow-400" />
        </div>
        <div className="w-full space-y-1">
          <h3 className="font-semibold text-sm truncate text-foreground/90 group-hover:text-foreground transition-colors" title={folder.name}>
            {folder.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {formatBytes(totalSize)}
            <span className="text-muted-foreground/50 mx-1">·</span>
            {format(new Date(folder.createdAt), "MMM d, yyyy")}
          </p>
        </div>
      </div>
    </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52 bg-card border-white/10 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <ContextMenuLabel className="text-foreground/70 text-xs font-normal truncate">{folder.name}</ContextMenuLabel>
        <ContextMenuSeparator className="bg-white/8" />
        <ContextMenuItem onClick={() => onClick(folder.id)} className="gap-2 cursor-pointer">
          <ChevronRight className="w-4 h-4" /> Open folder
        </ContextMenuItem>
        {onRename && (
          <ContextMenuItem onClick={() => onRename(folder)} className="gap-2 cursor-pointer">
            <Pencil className="w-4 h-4" /> Rename
          </ContextMenuItem>
        )}
        {onShare && (
          <ContextMenuItem onClick={() => onShare(folder)} className="gap-2 cursor-pointer">
            <Share2 className="w-4 h-4" /> Share folder
          </ContextMenuItem>
        )}
        <ContextMenuSeparator className="bg-white/8" />
        <ContextMenuItem
          onClick={() => onDelete(folder)}
          className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" /> Delete folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
