import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Download, 
  Link, 
  Share2, 
  ShieldOff, 
  Key, 
  Trash2,
  Pencil,
  Eye,
  RotateCw,
} from "lucide-react";
import type { File } from "@workspace/api-client-react";

interface FileContextMenuProps {
  children: React.ReactNode;
  file: File;
  onDownload: () => void;
  onPreview?: () => void;
  onRename?: () => void;
  onRefresh?: () => void;
  onShareLink: () => void;
  onShareEncrypted: () => void;
  onRevokeAccess: () => void;
  onTokenGate: () => void;
  onDelete: () => void;
}

export function FileContextMenu({
  children,
  file,
  onDownload,
  onPreview,
  onRename,
  onRefresh,
  onShareLink,
  onShareEncrypted,
  onRevokeAccess,
  onTokenGate,
  onDelete
}: FileContextMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 glass-panel">
        <DropdownMenuLabel className="truncate max-w-[200px]" title={file.name}>
          {file.name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {onPreview && (
          <DropdownMenuItem onClick={onPreview} className="cursor-pointer">
            <Eye className="w-4 h-4 mr-2 text-primary" />
            Preview
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onClick={onDownload} className="cursor-pointer">
          <Download className="w-4 h-4 mr-2 text-primary" />
          Download
        </DropdownMenuItem>

        {onRename && (
          <DropdownMenuItem onClick={onRename} className="cursor-pointer">
            <Pencil className="w-4 h-4 mr-2" />
            Rename
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem onClick={onShareLink} className="cursor-pointer">
          <Link className="w-4 h-4 mr-2" />
          Copy Public Link
        </DropdownMenuItem>
        
        {file.isEncrypted && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onShareEncrypted} className="cursor-pointer">
              <Share2 className="w-4 h-4 mr-2 text-accent" />
              Share (Wallet)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTokenGate} className="cursor-pointer">
              <Key className="w-4 h-4 mr-2 text-yellow-500" />
              Set Token Gate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRevokeAccess} className="cursor-pointer">
              <ShieldOff className="w-4 h-4 mr-2 text-orange-500" />
              Revoke Access
            </DropdownMenuItem>
          </>
        )}
        
        {onRefresh && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRefresh} className="cursor-pointer">
              <RotateCw className="w-4 h-4 mr-2" />
              Refresh
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
