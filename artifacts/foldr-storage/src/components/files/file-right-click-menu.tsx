import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Download,
  Link,
  Share2,
  ShieldOff,
  Key,
  Trash2,
  Pencil,
  Eye,
  Star,
} from "lucide-react";
import type { File } from "@workspace/api-client-react";

interface FileRightClickMenuProps {
  children: React.ReactNode;
  file: File;
  onDownload: () => void;
  onPreview?: () => void;
  onRename?: () => void;
  onShareLink: () => void;
  onShareEncrypted: () => void;
  onRevokeAccess: () => void;
  onTokenGate: () => void;
  onDelete: () => void;
  onStar?: () => void;
}

export function FileRightClickMenu({
  children,
  file,
  onDownload,
  onPreview,
  onRename,
  onShareLink,
  onShareEncrypted,
  onRevokeAccess,
  onTokenGate,
  onDelete,
  onStar,
}: FileRightClickMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56 bg-card border-white/10 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <ContextMenuLabel className="truncate max-w-[200px] text-foreground/70 text-xs font-normal" title={file.name}>
          {file.name}
        </ContextMenuLabel>
        <ContextMenuSeparator className="bg-white/8" />

        {onPreview && (
          <ContextMenuItem onClick={onPreview} className="gap-2 cursor-pointer">
            <Eye className="w-4 h-4 text-primary" />
            Preview
          </ContextMenuItem>
        )}

        <ContextMenuItem onClick={onDownload} className="gap-2 cursor-pointer">
          <Download className="w-4 h-4 text-primary" />
          Download
        </ContextMenuItem>

        {onRename && (
          <ContextMenuItem onClick={onRename} className="gap-2 cursor-pointer">
            <Pencil className="w-4 h-4" />
            Rename
          </ContextMenuItem>
        )}

        {onStar && (
          <ContextMenuItem onClick={onStar} className="gap-2 cursor-pointer">
            <Star className={`w-4 h-4 ${file.isStarred ? "text-yellow-400 fill-yellow-400" : ""}`} />
            {file.isStarred ? "Remove Star" : "Star"}
          </ContextMenuItem>
        )}

        <ContextMenuSeparator className="bg-white/8" />

        <ContextMenuItem onClick={onShareLink} className="gap-2 cursor-pointer">
          <Link className="w-4 h-4" />
          Copy Public Link
        </ContextMenuItem>

        {file.isEncrypted && (
          <>
            <ContextMenuItem onClick={onShareEncrypted} className="gap-2 cursor-pointer">
              <Share2 className="w-4 h-4 text-accent" />
              Share (Wallet)
            </ContextMenuItem>
            <ContextMenuItem onClick={onTokenGate} className="gap-2 cursor-pointer">
              <Key className="w-4 h-4 text-yellow-500" />
              Set Token Gate
            </ContextMenuItem>
            <ContextMenuItem onClick={onRevokeAccess} className="gap-2 cursor-pointer">
              <ShieldOff className="w-4 h-4 text-orange-500" />
              Revoke Access
            </ContextMenuItem>
          </>
        )}

        <ContextMenuSeparator className="bg-white/8" />

        <ContextMenuItem
          onClick={onDelete}
          className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
          Move to Trash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
