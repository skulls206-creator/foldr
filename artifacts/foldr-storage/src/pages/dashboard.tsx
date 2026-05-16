import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { FileCard } from "@/components/files/file-card";
import { FileListItem } from "@/components/files/file-list-item";
import { FolderCard, FolderRow } from "@/components/files/folder-row";
import { BulkActionBar } from "@/components/files/bulk-action-bar";
import { MoveFolderModal } from "@/components/files/move-folder-modal";
import { ShareEncryptedModal } from "@/components/files/share-encrypted-modal";
import { RevokeAccessModal } from "@/components/files/revoke-access-modal";
import { TokenGateModal } from "@/components/files/token-gate-modal";
import { CreateFolderModal } from "@/components/files/create-folder-modal";
import { PreviewPanel } from "@/components/files/preview-panel";
import { RenameModal } from "@/components/files/rename-modal";
import {
  useGetMe,
  useListFiles,
  useDeleteFile,
  useCreateShareLink,
  useToggleStarFile,
  useListFolders,
  useDeleteFolder,
  useBulkDeleteFiles,
  useBulkStarFiles,
  useBulkMoveFiles,
  useBulkDeleteFolders,
  useRenameFile,
  useRenameFolder,
  useMoveFile,
  useCreateFolderShare,
  type File,
  type Folder,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  FolderX,
  Loader2,
  FolderOpen,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare2,
  RotateCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { UploadModal } from "@/components/files/upload-modal";
import { UploadCloud, FolderPlus } from "lucide-react";
import { useRowDensity } from "@/hooks/use-row-density";

type SortBy = "name" | "size" | "date";
type SortOrder = "asc" | "desc";

function SortIcon({ field, sortBy, sortOrder }: { field: SortBy; sortBy: SortBy; sortOrder: SortOrder }) {
  if (sortBy !== field) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground/40" />;
  return sortOrder === "asc"
    ? <ArrowUp className="w-3.5 h-3.5 ml-1 text-primary" />
    : <ArrowDown className="w-3.5 h-3.5 ml-1 text-primary" />;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: isAuthLoading, error: authError } = useGetMe();
  
  const [currentFilter, setCurrentFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Selection state
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);

  // Single-item modal state
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [isTokenGateModalOpen, setIsTokenGateModalOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isBulkDeleteAlertOpen, setIsBulkDeleteAlertOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

  // Preview panel
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  // Rename modal
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; kind: "file" | "folder" } | null>(null);

  // Upload modal (triggered via right-click background)
  const [isRightClickUploadOpen, setIsRightClickUploadOpen] = useState(false);

  // Row density (persisted to localStorage)
  const { density, setDensity } = useRowDensity();

  const listParams = useMemo(() => {
    const params: Record<string, any> = {
      search: searchQuery || undefined,
    };
    if (currentFolderId) {
      params.folderId = currentFolderId;
    } else if (currentFilter === "starred") {
      params.starred = true;
    } else if (currentFilter === "all") {
      params.folderId = "root";
    }
    return params;
  }, [searchQuery, currentFilter, currentFolderId]);

  const { data: fileData, isLoading: isFilesLoading } = useListFiles(listParams, {
    query: { enabled: !!user },
  });
  const { data: foldersData } = useListFolders();
  const folders = foldersData?.folders ?? [];

  const queryClient = useQueryClient();
  const deleteMutation = useDeleteFile();
  const deleteFolderMutation = useDeleteFolder();
  const shareLinkMutation = useCreateShareLink();
  const starMutation = useToggleStarFile();
  const bulkDeleteFiles = useBulkDeleteFiles();
  const bulkStarFiles = useBulkStarFiles();
  const bulkMoveFiles = useBulkMoveFiles();
  const bulkDeleteFolders = useBulkDeleteFolders();
  const renameFileMutation = useRenameFile();
  const renameFolderMutation = useRenameFolder();
  const moveFileMutation = useMoveFile();
  const createFolderShareMutation = useCreateFolderShare();
  const { toast } = useToast();

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["listFiles"] });
    queryClient.invalidateQueries({ queryKey: ["listFolders"] });
    toast({ title: "Refreshed" });
  }, [queryClient, toast]);

  // Redirect if not logged in
  useEffect(() => {
    if (authError && (authError as any).status === 401) {
      setLocation("/login");
    }
  }, [authError, setLocation]);

  // Clear selection when changing views
  useEffect(() => {
    setSelectedFileIds(new Set());
    setSelectedFolderIds(new Set());
  }, [currentFilter, currentFolderId, searchQuery]);

  // Keyboard shortcut: Escape to clear selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedFileIds(new Set());
        setSelectedFolderIds(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleFilterChange = (filter: string) => {
    setCurrentFilter(filter);
    setCurrentFolderId(null);
  };

  const handleFolderClick = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    if (folderId) setCurrentFilter("all");
  };

  const handleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortOrder(o => o === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
  };

  // ── Filtered data ─────────────────────────────────────────────────────────

  const filteredFiles = useMemo(() => {
    if (!fileData?.files) return [];
    let files = fileData.files;

    if (!currentFolderId) {
      if (currentFilter === "encrypted") files = files.filter(f => f.isEncrypted && !f.isDeleted);
      else if (currentFilter === "recent") files = files.filter(f => !f.isDeleted);
      else if (currentFilter === "deleted") files = fileData.files.filter(f => f.isDeleted);
      else files = files.filter(f => !f.isDeleted);
    } else {
      files = files.filter(f => !f.isDeleted);
    }

    const sorted = [...files].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      else if (sortBy === "size") cmp = a.size - b.size;
      else cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === "asc" ? cmp : -cmp;
    });

    if (!currentFolderId && currentFilter === "recent") return sorted.slice(0, 10);
    return sorted;
  }, [fileData?.files, currentFilter, currentFolderId, sortBy, sortOrder]);

  // Folders shown inline in the main area (only in "all" view at root or inside a folder)
  const inlineFolders = useMemo(() => {
    if (searchQuery) return [];
    if (currentFilter !== "all" && !currentFolderId) return [];
    const raw = currentFolderId
      ? folders.filter(f => f.parentId === currentFolderId)
      : folders.filter(f => !f.parentId);
    return [...raw].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name" || sortBy === "size") {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [folders, currentFilter, currentFolderId, searchQuery, sortBy, sortOrder]);

  // ── Selection helpers ─────────────────────────────────────────────────────

  const isSelecting = selectedFileIds.size > 0 || selectedFolderIds.size > 0;
  const totalSelected = selectedFileIds.size + selectedFolderIds.size;

  const handleFileSelect = useCallback((id: string, selected: boolean) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const handleFolderSelect = useCallback((id: string, selected: boolean) => {
    setSelectedFolderIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = () => {
    if (selectedFileIds.size === filteredFiles.length && selectedFolderIds.size === inlineFolders.length) {
      setSelectedFileIds(new Set());
      setSelectedFolderIds(new Set());
    } else {
      setSelectedFileIds(new Set(filteredFiles.map(f => f.id)));
      setSelectedFolderIds(new Set(inlineFolders.map(f => f.id)));
    }
  };

  const clearSelection = () => {
    setSelectedFileIds(new Set());
    setSelectedFolderIds(new Set());
  };

  const allSelected =
    filteredFiles.length + inlineFolders.length > 0 &&
    selectedFileIds.size === filteredFiles.length &&
    selectedFolderIds.size === inlineFolders.length;

  const someSelected = totalSelected > 0 && !allSelected;

  // ── Bulk actions ──────────────────────────────────────────────────────────

  const selectedFilesData = useMemo(
    () => filteredFiles.filter(f => selectedFileIds.has(f.id)),
    [filteredFiles, selectedFileIds]
  );

  const allFilesStarred = selectedFilesData.length > 0 && selectedFilesData.every(f => f.isStarred);

  const handleBulkDownload = () => {
    selectedFilesData.forEach(file => {
      const a = document.createElement("a");
      a.href = `/api/files/${file.id}/download`;
      a.download = file.name;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    toast({ title: `Downloading ${selectedFilesData.length} file${selectedFilesData.length > 1 ? "s" : ""}` });
  };

  const handleOpenAll = () => {
    selectedFilesData.forEach(file => {
      window.open(`/api/files/${file.id}/download`, "_blank");
    });
    toast({ title: `Opened ${selectedFilesData.length} file${selectedFilesData.length > 1 ? "s" : ""} in new tabs` });
  };

  const handleBulkStar = async (star: boolean) => {
    if (selectedFileIds.size === 0) return;
    await bulkStarFiles.mutateAsync({ ids: [...selectedFileIds], starred: star });
    toast({ title: star ? `Starred ${selectedFileIds.size} files` : `Removed star from ${selectedFileIds.size} files` });
  };

  const handleBulkDelete = async () => {
    const fileIds = [...selectedFileIds];
    const folderIds = [...selectedFolderIds];

    await Promise.all([
      fileIds.length > 0 ? bulkDeleteFiles.mutateAsync({ ids: fileIds }) : Promise.resolve(),
      folderIds.length > 0 ? bulkDeleteFolders.mutateAsync({ ids: folderIds }) : Promise.resolve(),
    ]);

    toast({ title: `Deleted ${totalSelected} item${totalSelected > 1 ? "s" : ""}` });
    clearSelection();
    setIsBulkDeleteAlertOpen(false);
  };

  const handleBulkMove = async (targetFolderId: string | null) => {
    if (selectedFileIds.size === 0) return;
    await bulkMoveFiles.mutateAsync({ ids: [...selectedFileIds], folderId: targetFolderId });
    toast({ title: `Moved ${selectedFileIds.size} file${selectedFileIds.size > 1 ? "s" : ""}` });
    clearSelection();
  };

  // ── Single-item actions ───────────────────────────────────────────────────

  const handleShareLink = (file: File) => {
    shareLinkMutation.mutate(
      { id: file.id, data: {} },
      {
        onSuccess: (data) => {
          const url = `${window.location.origin}/share/${data.token}`;
          navigator.clipboard.writeText(url);
          toast({ title: "Link Copied", description: "Public share link copied to clipboard." });
          queryClient.invalidateQueries({ queryKey: ["/api/files/share-links"] });
        },
        onError: () => toast({ variant: "destructive", title: "Failed", description: "Could not create share link." }),
      }
    );
  };

  const handleStar = (file: File) => {
    starMutation.mutate({ id: file.id }, {
      onError: () => toast({ variant: "destructive", title: "Error", description: "Could not update star." }),
    });
  };

  const confirmDelete = () => {
    if (!activeFile) return;
    deleteMutation.mutate({ id: activeFile.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        queryClient.invalidateQueries({ queryKey: ["/api/files/usage"] });
        toast({ title: "Deleted", description: "File moved to trash." });
        setIsDeleteAlertOpen(false);
      },
      onError: () => toast({ variant: "destructive", title: "Error", description: "Could not delete file." }),
    });
  };

  const confirmDeleteFolder = () => {
    if (!folderToDelete) return;
    deleteFolderMutation.mutate({ id: folderToDelete.id }, {
      onSuccess: () => {
        toast({ title: "Folder deleted" });
        setFolderToDelete(null);
      },
      onError: () => toast({ variant: "destructive", title: "Error", description: "Could not delete folder." }),
    });
  };

  // ── Rename ─────────────────────────────────────────────────────────────────

  const handleRenameSubmit = async (newName: string) => {
    if (!renameTarget) return;
    try {
      if (renameTarget.kind === "file") {
        await renameFileMutation.mutateAsync({ id: renameTarget.id, data: { name: newName } });
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        toast({ title: "Renamed", description: `File renamed to "${newName}".` });
      } else {
        await renameFolderMutation.mutateAsync({ id: renameTarget.id, data: { name: newName } });
        queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
        toast({ title: "Renamed", description: `Folder renamed to "${newName}".` });
      }
      setRenameTarget(null);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not rename." });
    }
  };

  // ── Drag-to-move ───────────────────────────────────────────────────────────

  const handleFileDrop = (targetFolderId: string, fileId: string) => {
    moveFileMutation.mutate({ id: fileId, folderId: targetFolderId }, {
      onSuccess: () => {
        toast({ title: "Moved", description: "File moved to folder." });
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      },
      onError: () => toast({ variant: "destructive", title: "Error", description: "Could not move file." }),
    });
  };

  // ── Folder share ───────────────────────────────────────────────────────────

  const handleShareFolder = (folder: Folder) => {
    createFolderShareMutation.mutate({ data: { folderId: folder.id } }, {
      onSuccess: (data: any) => {
        const url = `${window.location.origin}${import.meta.env.BASE_URL}shared-folder/${data.token}`;
        navigator.clipboard.writeText(url);
        toast({ title: "Share Link Copied", description: "Shareable folder link copied to clipboard." });
      },
      onError: () => toast({ variant: "destructive", title: "Error", description: "Could not create folder share link." }),
    });
  };

  // ── Derived UI state ──────────────────────────────────────────────────────

  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null;

  const pageTitle = useMemo(() => {
    if (currentFolder) return currentFolder.name;
    if (currentFilter === "all") return "My Files";
    if (currentFilter === "encrypted") return "Encrypted Files";
    if (currentFilter === "recent") return "Recent Uploads";
    if (currentFilter === "starred") return "Starred";
    if (currentFilter === "deleted") return "Trash";
    return "My Files";
  }, [currentFilter, currentFolder]);

  const sortLabel = useMemo(() => {
    const labels: Record<SortBy, string> = { name: "Name", size: "Size", date: "Date" };
    return `${labels[sortBy]} ${sortOrder === "asc" ? "↑" : "↓"}`;
  }, [sortBy, sortOrder]);

  const totalItems = inlineFolders.length + filteredFiles.length;

  if (isAuthLoading || (isFilesLoading && !fileData)) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppLayout
      currentFilter={currentFilter}
      onFilterChange={handleFilterChange}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      density={density}
      onDensityChange={setDensity}
      folders={folders}
      currentFolderId={currentFolderId}
      onFolderClick={handleFolderClick}
      onNewFolder={() => setIsCreateFolderOpen(true)}
    >
      <div className={`flex gap-6 ${previewFile ? "h-full" : ""}`}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <div className={`${previewFile ? "flex-1 min-w-0 overflow-y-auto" : "w-full"} pb-32`}>
        {/* Page header */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            {currentFolder && (
              <>
                <button
                  onClick={() => setCurrentFolderId(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors text-2xl font-display font-bold flex-shrink-0"
                >
                  My Files
                </button>
                <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              </>
            )}
            <h2 className="text-2xl font-display font-bold flex items-center gap-2 truncate">
              {currentFolder && <FolderOpen className="w-6 h-6 text-yellow-500/70 flex-shrink-0" />}
              {pageTitle}
            </h2>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Inline bulk bar — desktop only (lg+), replaces items count + sort */}
            {isSelecting ? (
              <div className="hidden lg:flex">
                <BulkActionBar
                  variant="inline"
                  selectedCount={totalSelected}
                  selectedFileIds={[...selectedFileIds]}
                  selectedFolderIds={[...selectedFolderIds]}
                  allFilesStarred={allFilesStarred}
                  onClearSelection={clearSelection}
                  onDownloadAll={handleBulkDownload}
                  onOpenAll={handleOpenAll}
                  onStarAll={handleBulkStar}
                  onDeleteAll={() => setIsBulkDeleteAlertOpen(true)}
                  onMoveAll={() => setIsMoveModalOpen(true)}
                />
              </div>
            ) : (
              <>
                <span className="text-sm text-muted-foreground hidden sm:block">{totalItems} items</span>

                {viewMode === "grid" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="border-white/10 text-muted-foreground hover:text-foreground text-xs gap-1.5">
                        <ArrowUpDown className="w-3.5 h-3.5" />
                        Sort: {sortLabel}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 bg-card border-white/10">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Sort by</DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-white/5" />
                      {(["name", "size", "date"] as SortBy[]).map(field => (
                        <DropdownMenuItem
                          key={field}
                          onClick={() => handleSort(field)}
                          className={`capitalize text-sm cursor-pointer ${sortBy === field ? "text-primary" : ""}`}
                        >
                          {field}
                          {sortBy === field && <span className="ml-auto text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
          </div>
        </div>

        {/* Empty state */}
        {totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/10 shadow-2xl">
              <FolderX className="w-10 h-10 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-foreground/80">No files found</h3>
            <p className="text-muted-foreground max-w-sm">
              {searchQuery
                ? "We couldn't find anything matching your search."
                : currentFilter === "starred"
                ? "Star files to find them quickly here."
                : "Upload some files to get started with secure decentralized storage."}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          /* ── Grid view ─────────────────────────────────────────────────── */
          <div className="space-y-6 sm:space-y-8">
            {/* Folder grid section */}
            {inlineFolders.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Folders</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
                  {inlineFolders.map(folder => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      isSelected={selectedFolderIds.has(folder.id)}
                      isSelecting={isSelecting}
                      onSelect={handleFolderSelect}
                      onClick={handleFolderClick}
                      onDelete={f => setFolderToDelete(f)}
                      onRefresh={handleRefresh}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Files grid section */}
            {filteredFiles.length > 0 && (
              <div>
                {inlineFolders.length > 0 && (
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Files</h3>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
                  {filteredFiles.map(file => (
                    <FileCard
                      key={file.id}
                      file={file}
                      isSelected={selectedFileIds.has(file.id)}
                      isSelecting={isSelecting}
                      onSelect={handleFileSelect}
                      onShareLink={handleShareLink}
                      onShareEncrypted={f => { setActiveFile(f); setIsShareModalOpen(true); }}
                      onRevokeAccess={f => { setActiveFile(f); setIsRevokeModalOpen(true); }}
                      onTokenGate={f => { setActiveFile(f); setIsTokenGateModalOpen(true); }}
                      onDelete={f => { setActiveFile(f); setIsDeleteAlertOpen(true); }}
                      onRefresh={handleRefresh}
                      onStar={handleStar}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── List view ─────────────────────────────────────────────────── */
          <div className="rounded-xl border border-white/[0.07] overflow-hidden">
            {/* Sortable column header */}
            <div className="flex items-center justify-between px-4 py-3 sm:px-4 sm:py-2.5 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider select-none border-b border-white/[0.07] bg-white/[0.02]">
              {/* LEFT */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className={`w-4 flex-shrink-0 transition-opacity ${isSelecting || someSelected ? "opacity-100" : "opacity-0 hover:opacity-60"}`}
                  onClick={handleSelectAll}
                >
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    className="border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=indeterminate]:bg-primary/50 data-[state=indeterminate]:border-primary"
                  />
                </div>
                <div className="w-7 flex-shrink-0" />
                <button
                  onClick={() => handleSort("name")}
                  className="flex-1 flex items-center text-left hover:text-foreground/80 transition-colors min-w-0"
                >
                  Name <SortIcon field="name" sortBy={sortBy} sortOrder={sortOrder} />
                </button>
              </div>
              {/* RIGHT */}
              <div className="flex items-center pl-4 flex-shrink-0">
                <button
                  onClick={() => handleSort("size")}
                  className="w-20 text-right hidden sm:flex items-center justify-end hover:text-foreground/80 transition-colors flex-shrink-0"
                >
                  Size <SortIcon field="size" sortBy={sortBy} sortOrder={sortOrder} />
                </button>
                <button
                  onClick={() => handleSort("date")}
                  className="w-32 text-right hidden sm:flex items-center justify-end hover:text-foreground/80 transition-colors flex-shrink-0"
                >
                  Date <SortIcon field="date" sortBy={sortBy} sortOrder={sortOrder} />
                </button>
                <div className="w-20 text-right hidden sm:block flex-shrink-0">Type</div>
                <div className="w-8 flex-shrink-0" />
              </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-white/[0.04]">
              {inlineFolders.map(folder => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  isSelected={selectedFolderIds.has(folder.id)}
                  isSelecting={isSelecting}
                  density={density}
                  onSelect={handleFolderSelect}
                  onClick={handleFolderClick}
                  onDelete={f => setFolderToDelete(f)}
                  onRename={f => setRenameTarget({ id: f.id, name: f.name, kind: "folder" })}
                  onShare={handleShareFolder}
                  onRefresh={handleRefresh}
                  onDrop={handleFileDrop}
                />
              ))}

              {inlineFolders.length > 0 && filteredFiles.length > 0 && (
                <div className="border-t border-white/[0.06]" />
              )}

              {filteredFiles.map(file => (
                <FileListItem
                  key={file.id}
                  file={file}
                  isSelected={selectedFileIds.has(file.id)}
                  isSelecting={isSelecting}
                  density={density}
                  onSelect={handleFileSelect}
                  onPreview={f => setPreviewFile(f)}
                  onRename={f => setRenameTarget({ id: f.id, name: f.name, kind: "file" })}
                  onShareLink={handleShareLink}
                  onShareEncrypted={f => { setActiveFile(f); setIsShareModalOpen(true); }}
                  onRevokeAccess={f => { setActiveFile(f); setIsRevokeModalOpen(true); }}
                  onTokenGate={f => { setActiveFile(f); setIsTokenGateModalOpen(true); }}
                  onDelete={f => { setActiveFile(f); setIsDeleteAlertOpen(true); }}
                  onRefresh={handleRefresh}
                  onStar={handleStar}
                />
              ))}
            </div>
          </div>
        )}
      </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52 bg-card border-white/10 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <ContextMenuItem
            onClick={() => setIsRightClickUploadOpen(true)}
            className="gap-2 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 text-primary" />
            Upload Files
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-white/8" />
          <ContextMenuItem
            onClick={() => setIsCreateFolderOpen(true)}
            className="gap-2 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            New Folder
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-white/8" />
          <ContextMenuItem
            onClick={handleRefresh}
            className="gap-2 cursor-pointer"
          >
            <RotateCw className="w-4 h-4" />
            Refresh
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Preview panel (side panel) */}
      {previewFile && (
        <PreviewPanel
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      <UploadModal
        isOpen={isRightClickUploadOpen}
        onClose={() => setIsRightClickUploadOpen(false)}
        folderId={currentFolderId}
      />

      <RenameModal
        isOpen={!!renameTarget}
        currentName={renameTarget?.name ?? ""}
        kind={renameTarget?.kind ?? "file"}
        onClose={() => setRenameTarget(null)}
        onConfirm={async (newName) => { await handleRenameSubmit(newName); }}
      />

      <CreateFolderModal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        parentId={currentFolderId}
      />

      <MoveFolderModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        folders={folders}
        currentFolderId={currentFolderId}
        fileCount={selectedFileIds.size}
        onMove={handleBulkMove}
      />

      {activeFile && (
        <>
          <ShareEncryptedModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} fileId={activeFile.id} />
          <RevokeAccessModal isOpen={isRevokeModalOpen} onClose={() => setIsRevokeModalOpen(false)} fileId={activeFile.id} />
          <TokenGateModal isOpen={isTokenGateModalOpen} onClose={() => setIsTokenGateModalOpen(false)} fileId={activeFile.id} />

          <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
            <AlertDialogContent className="glass-panel border-white/10">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete File?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will move '{activeFile.name}' to the trash.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-transparent border-white/10">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                  Move to Trash
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      {/* Folder delete confirmation */}
      {folderToDelete && (
        <AlertDialog open={!!folderToDelete} onOpenChange={open => { if (!open) setFolderToDelete(null); }}>
          <AlertDialogContent className="glass-panel border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Folder?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the folder '{folderToDelete.name}'. Files inside will be moved to your root.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-transparent border-white/10">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteFolder} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                Delete Folder
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Bulk delete confirmation */}
      <AlertDialog open={isBulkDeleteAlertOpen} onOpenChange={setIsBulkDeleteAlertOpen}>
        <AlertDialogContent className="glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {totalSelected} items?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedFileIds.size > 0 && `${selectedFileIds.size} file${selectedFileIds.size > 1 ? "s" : ""} will be moved to trash. `}
              {selectedFolderIds.size > 0 && `${selectedFolderIds.size} folder${selectedFolderIds.size > 1 ? "s" : ""} will be permanently deleted and their files moved to root.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk action bar — floating on mobile/tablet, inline on desktop ── */}
      {/* Floating version: shown only below lg breakpoint */}
      <div className="lg:hidden">
        <BulkActionBar
          variant="floating"
          selectedCount={totalSelected}
          selectedFileIds={[...selectedFileIds]}
          selectedFolderIds={[...selectedFolderIds]}
          allFilesStarred={allFilesStarred}
          onClearSelection={clearSelection}
          onDownloadAll={handleBulkDownload}
          onOpenAll={handleOpenAll}
          onStarAll={handleBulkStar}
          onDeleteAll={() => setIsBulkDeleteAlertOpen(true)}
          onMoveAll={() => setIsMoveModalOpen(true)}
        />
      </div>
    </AppLayout>
  );
}
