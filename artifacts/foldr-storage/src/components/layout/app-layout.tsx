import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { 
  Lock, 
  Clock, 
  Trash2, 
  LogOut,
  UploadCloud,
  Search,
  LayoutGrid,
  List as ListIcon,
  Shield,
  Star,
  FolderOpen,
  FolderPlus,
  PanelLeftClose,
  ChevronRight,
  Download,
  Smartphone,
  Rows2,
  Rows3,
  Rows4,
  X,
  Activity,
  Settings,
  Share2,
  HardDrive,
} from "lucide-react";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarGroup, 
  SidebarGroupContent, 
  SidebarGroupLabel, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem,
  SidebarProvider,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useGetMe, useLogout, useGetStorageStatus } from "@workspace/api-client-react";
import { useStorageUsage } from "@workspace/api-client-react";
import type { Folder } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UploadModal } from "@/components/files/upload-modal";
import { SyncWidget } from "@/components/sync/sync-widget";
import { MobileSyncBar } from "@/components/sync/mobile-sync-bar";
import { KhurkOSBanner } from "@/components/layout/khurk-os-banner";
import { useFolderSyncCtx } from "@/contexts/folder-sync-context";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { RowDensity } from "@/hooks/use-row-density";

interface AppLayoutProps {
  children: React.ReactNode;
  currentFilter: string;
  onFilterChange: (filter: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  density?: RowDensity;
  onDensityChange?: (d: RowDensity) => void;
  folders?: Folder[];
  currentFolderId?: string | null;
  onFolderClick?: (folderId: string | null) => void;
  onNewFolder?: () => void;
}

function StorageBar({ usedBytes, limitBytes }: { usedBytes: number; limitBytes: number }) {
  const pct = Math.min(100, (usedBytes / limitBytes) * 100);
  const color = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-yellow-500" : "bg-green-500";
  const textColor = pct >= 90 ? "text-red-400" : pct >= 75 ? "text-yellow-400" : "text-green-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">Storage</span>
        <span className={`font-semibold ${textColor}`}>
          {formatBytes(usedBytes)} / {formatBytes(limitBytes)}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {pct >= 90 && (
        <p className="text-[10px] text-red-400 font-medium">Storage almost full — delete files to free space.</p>
      )}
    </div>
  );
}

function IosInstallTip({ onClose }: { onClose: () => void }) {
  return (
    <div className="relative p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-foreground/80 space-y-1">
      <button onClick={onClose} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
        <X className="w-3.5 h-3.5" />
      </button>
      <p className="font-semibold text-primary flex items-center gap-1">
        <Smartphone className="w-3.5 h-3.5" /> Install on iOS
      </p>
      <p>Tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong> to install FOLDR.</p>
    </div>
  );
}

function FolderTreeItem({
  folder,
  allFolders,
  depth,
  currentFolderId,
  expandedFolders,
  onToggleExpand,
  onFolderClick,
}: {
  folder: Folder;
  allFolders: Folder[];
  depth: number;
  currentFolderId?: string | null;
  expandedFolders: Set<string>;
  onToggleExpand: (id: string) => void;
  onFolderClick: (id: string) => void;
}) {
  const children = allFolders.filter(f => f.parentId === folder.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedFolders.has(folder.id);
  const isActive = currentFolderId === folder.id;

  return (
    <>
      <SidebarMenuItem>
        <div
          className="flex items-center w-full gap-0.5"
          style={depth > 0 ? { paddingLeft: `${depth * 12}px` } : undefined}
        >
          <button
            onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggleExpand(folder.id); }}
            className={cn(
              "flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors",
              hasChildren
                ? "text-muted-foreground/60 hover:text-foreground hover:bg-white/10"
                : "opacity-0 pointer-events-none"
            )}
          >
            <ChevronRight className={cn(
              "w-3.5 h-3.5 transition-transform duration-200",
              isExpanded && "rotate-90"
            )} />
          </button>

          <SidebarMenuButton
            isActive={isActive}
            onClick={() => onFolderClick(folder.id)}
            className="flex-1 transition-all duration-200 min-w-0"
          >
            <FolderOpen className={cn("w-4 h-4 mr-2 flex-shrink-0", isActive ? "text-primary" : "text-yellow-500/70")} />
            <span className="font-medium truncate flex-1">{folder.name}</span>
          </SidebarMenuButton>
        </div>
      </SidebarMenuItem>

      {hasChildren && isExpanded && children.map(child => (
        <FolderTreeItem
          key={child.id}
          folder={child}
          allFolders={allFolders}
          depth={depth + 1}
          currentFolderId={currentFolderId}
          expandedFolders={expandedFolders}
          onToggleExpand={onToggleExpand}
          onFolderClick={onFolderClick}
        />
      ))}
    </>
  );
}

function SidebarInner({
  currentFilter,
  onFilterChange,
  folders,
  currentFolderId,
  onFolderClick,
  onNewFolder,
}: Pick<AppLayoutProps, "currentFilter" | "onFilterChange" | "folders" | "currentFolderId" | "onFolderClick" | "onNewFolder">) {
  const { data: user } = useGetMe();
  const { data: status } = useGetStorageStatus();
  const { data: usage } = useStorageUsage();
  const logoutMutation = useLogout();
  const installState = usePwaInstall();
  const [showIosTip, setShowIosTip] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("foldr-auth-token");
        window.location.href = "/login";
      },
    });
  };

  const handleToggleExpand = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleFolderClick = (id: string) => {
    onFolderClick?.(id);
    const children = (folders ?? []).filter(f => f.parentId === id);
    if (children.length > 0) {
      setExpandedFolders(prev => new Set([...prev, id]));
    }
  };

  const [loc] = useLocation();

  const navItems = [
    { id: "encrypted", label: "Encrypted Files", icon: Lock, className: "text-accent" },
    { id: "starred", label: "Starred", icon: Star },
    { id: "recent", label: "Recent", icon: Clock },
  ];

  const rootFolders = (folders ?? []).filter(f => !f.parentId);

  const displayLabel = (user as any)?.displayName || user?.email || "Account";

  return (
    <>
      <SidebarHeader className="px-3 py-3 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="font-display font-bold text-lg tracking-tight text-primary">FOLDR</span>
          </div>
          <SidebarTrigger className="text-muted-foreground/60 hover:text-foreground hover:bg-white/10 rounded-md p-1.5 transition-colors -mr-1">
            <X className="w-4 h-4" />
          </SidebarTrigger>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/50 uppercase tracking-widest text-[10px] font-semibold">
            Drive
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={!currentFolderId && currentFilter === item.id}
                    onClick={() => { onFilterChange(item.id); onFolderClick?.(null); }}
                    className={`transition-all duration-200 ${item.className || ''}`}
                  >
                    <item.icon className="w-4 h-4 mr-2" />
                    <span className="font-medium">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <Link to="/trash">
                  <SidebarMenuButton isActive={loc === "/trash"} className="transition-all duration-200">
                    <Trash2 className="w-4 h-4 mr-2" />
                    <span className="font-medium">Trash</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link to="/sharing">
                  <SidebarMenuButton isActive={loc === "/sharing"} className="transition-all duration-200">
                    <Share2 className="w-4 h-4 mr-2" />
                    <span className="font-medium">Sharing</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link to="/activity">
                  <SidebarMenuButton isActive={loc === "/activity"} className="transition-all duration-200">
                    <Activity className="w-4 h-4 mr-2" />
                    <span className="font-medium">Activity</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link to="/settings">
                  <SidebarMenuButton isActive={loc === "/settings"} className="transition-all duration-200">
                    <Settings className="w-4 h-4 mr-2" />
                    <span className="font-medium">Settings</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <div className="flex items-center justify-between pr-2">
            <SidebarGroupLabel className="text-muted-foreground/50 uppercase tracking-widest text-[10px] font-semibold">
              Folders
            </SidebarGroupLabel>
            {onNewFolder && (
              <button
                onClick={onNewFolder}
                className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                title="New folder"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {rootFolders.map((folder) => (
                <FolderTreeItem
                  key={folder.id}
                  folder={folder}
                  allFolders={folders ?? []}
                  depth={0}
                  currentFolderId={currentFolderId}
                  expandedFolders={expandedFolders}
                  onToggleExpand={handleToggleExpand}
                  onFolderClick={handleFolderClick}
                />
              ))}
              {rootFolders.length === 0 && (
                <SidebarMenuItem>
                  <button
                    onClick={onNewFolder}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-white/5"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    Create your first folder
                  </button>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-white/5 space-y-2.5">
        {usage && (
          <StorageBar usedBytes={usage.usedBytes} limitBytes={usage.limitBytes} />
        )}

        <SyncWidget />

        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          <Shield className={`w-4 h-4 flex-shrink-0 ${status?.backend === 'lighthouse' ? 'text-primary' : 'text-muted-foreground'}`} />
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] text-muted-foreground/70">Network:</span>
            <span className="text-[11px] font-semibold capitalize text-foreground/80">{status?.backend || '...'}</span>
          </div>
        </div>

        {installState.type === "available" && (
          <Button
            variant="outline"
            size="sm"
            className="w-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary gap-2 h-7 text-xs"
            onClick={installState.prompt}
          >
            <Download className="w-3.5 h-3.5" />
            Install App
          </Button>
        )}
        {installState.type === "ios" && !showIosTip && (
          <Button
            variant="outline"
            size="sm"
            className="w-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary gap-2 h-7 text-xs"
            onClick={() => setShowIosTip(true)}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Add to Home Screen
          </Button>
        )}
        {installState.type === "ios" && showIosTip && (
          <IosInstallTip onClose={() => setShowIosTip(false)} />
        )}

        <div className="flex items-center justify-between pt-0.5">
          <Link to="/settings" className="flex flex-col truncate pr-2 group cursor-pointer min-w-0">
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Signed in as</span>
            <span className="text-xs font-medium truncate group-hover:text-primary transition-colors" title={user?.email}>
              {displayLabel}
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="h-7 w-7 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </SidebarFooter>
    </>
  );
}

export function AppLayout({
  children,
  currentFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  density = "comfortable",
  onDensityChange,
  folders,
  currentFolderId,
  onFolderClick,
  onNewFolder,
}: AppLayoutProps) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [loc] = useLocation();
  const { state: syncState } = useFolderSyncCtx();
  const hasMobileSyncBar = !!syncState.folderName;

  // Handle ?action=upload deep-link from the PWA home screen shortcut
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "upload") {
      setIsUploadModalOpen(true);
      params.delete("action");
      const newSearch = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (newSearch ? `?${newSearch}` : "")
      );
    }
  }, []);

  return (
    <SidebarProvider style={{ "--sidebar-width": "13.5rem" } as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar className="border-r border-white/5 bg-card/30">
          <SidebarInner
            currentFilter={currentFilter}
            onFilterChange={onFilterChange}
            folders={folders}
            currentFolderId={currentFolderId}
            onFolderClick={onFolderClick}
            onNewFolder={onNewFolder}
          />
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <header className="flex flex-col border-b border-white/5 bg-background/50 backdrop-blur-md z-10 flex-shrink-0">

            {/* KHURK OS iframe detection banner */}
            <KhurkOSBanner />

            {/* Mobile search bar — slides in below the main toolbar row */}
            {isSearchOpen && (
              <div className="flex items-center gap-2 px-3 pb-3 sm:hidden">
                <div className="relative flex-1 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    autoFocus
                    placeholder="Search in FOLDR..."
                    className="pl-9 bg-white/5 border-white/10 focus-visible:border-primary focus-visible:ring-primary/20 rounded-full h-9 w-full text-sm"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => { setIsSearchOpen(false); onSearchChange(""); }}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Main toolbar row */}
            <div className="h-14 sm:h-16 flex items-center justify-between px-3 sm:px-6 gap-2">

              {/* Left: sidebar toggle + desktop search */}
              <div className="flex items-center flex-1 gap-2 min-w-0">
                <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                  <PanelLeftClose className="w-5 h-5" />
                </SidebarTrigger>

                {/* Desktop search bar */}
                <div className="relative flex-1 group hidden sm:block max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    placeholder="Search in FOLDR..."
                    className="pl-10 bg-white/5 border-white/10 focus-visible:border-primary focus-visible:ring-primary/20 rounded-full h-9 w-full"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Right: action buttons */}
              <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">

                {/* Mobile search toggle */}
                <button
                  className={cn(
                    "sm:hidden w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                    isSearchOpen
                      ? "bg-primary/20 text-primary"
                      : "bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10"
                  )}
                  onClick={() => setIsSearchOpen(s => !s)}
                  aria-label="Search"
                >
                  <Search className="w-4 h-4" />
                </button>

                {/* View mode toggle */}
                <div className="flex items-center p-0.5 bg-white/5 rounded-lg border border-white/5">
                  <button
                    className={cn(
                      "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                      viewMode === 'grid' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => onViewModeChange('grid')}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className={cn(
                      "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                      viewMode === 'list' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => onViewModeChange('list')}
                    aria-label="List view"
                  >
                    <ListIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Row density toggle — only in list view on md+ screens */}
                {viewMode === 'list' && onDensityChange && (
                  <div className="hidden md:flex items-center p-0.5 bg-white/5 rounded-lg border border-white/5">
                    <button
                      className={cn(
                        "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                        density === 'comfortable' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => onDensityChange('comfortable')}
                      title="Comfortable"
                      aria-label="Comfortable row density"
                    >
                      <Rows2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className={cn(
                        "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                        density === 'cozy' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => onDensityChange('cozy')}
                      title="Cozy"
                      aria-label="Cozy row density"
                    >
                      <Rows3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className={cn(
                        "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                        density === 'compact' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => onDensityChange('compact')}
                      title="Compact"
                      aria-label="Compact row density"
                    >
                      <Rows4 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Settings button */}
                <Link to="/settings">
                  <button
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors border",
                      loc === "/settings"
                        ? "bg-primary/15 border-primary/30 text-primary"
                        : "bg-white/5 border-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10"
                    )}
                    title="Settings"
                    aria-label="Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </Link>

                {/* New Folder — icon-only on mobile, text on desktop */}
                {onNewFolder && (
                  <button
                    onClick={onNewFolder}
                    className="flex items-center justify-center gap-1.5 px-2 sm:px-3 h-8 rounded-lg border border-white/10 bg-transparent text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors text-sm"
                    title="New Folder"
                  >
                    <FolderPlus className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden sm:inline font-medium">New Folder</span>
                  </button>
                )}

                {/* Upload — icon + label on mobile, full button on desktop */}
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="flex items-center justify-center gap-1.5 px-2.5 sm:px-5 h-8 sm:h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-200 text-sm font-medium"
                >
                  <UploadCloud className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Upload</span>
                </button>
              </div>
            </div>
          </header>

          <main className={cn(
            "flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 relative",
            hasMobileSyncBar && "pb-28 sm:pb-6 lg:pb-8"
          )}>
            {children}
          </main>
        </div>
      </div>

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        folderId={currentFolderId}
      />

      {/* Floating sync bar — mobile only, always visible when folder is connected */}
      <MobileSyncBar />
    </SidebarProvider>
  );
}
