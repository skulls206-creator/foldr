import { useState } from "react";
import { useLocation } from "wouter";
import { Activity, Upload, Download, Trash2, Star, FolderPlus, RotateCcw, Move, Share2, Lock, Loader2, FileDown } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMe, useListFolders, useListActivity } from "@workspace/api-client-react";
import type { ActivityLog } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function actionIcon(action: string) {
  const cls = "w-4 h-4 flex-shrink-0";
  switch (action) {
    case "upload": return <Upload className={`${cls} text-primary`} />;
    case "download": return <Download className={`${cls} text-blue-400`} />;
    case "delete": return <Trash2 className={`${cls} text-destructive`} />;
    case "star": return <Star className={`${cls} text-yellow-400`} />;
    case "unstar": return <Star className={`${cls} text-muted-foreground`} />;
    case "create_folder": return <FolderPlus className={`${cls} text-yellow-500`} />;
    case "restore": return <RotateCcw className={`${cls} text-green-400`} />;
    case "move": return <Move className={`${cls} text-blue-400`} />;
    case "rename": return <Activity className={`${cls} text-accent`} />;
    case "share_folder":
    case "create_share_link": return <Share2 className={`${cls} text-primary`} />;
    case "empty_trash": return <Trash2 className={`${cls} text-destructive`} />;
    case "totp_enabled":
    case "totp_disabled": return <Lock className={`${cls} text-primary`} />;
    case "login": return <Lock className={`${cls} text-green-400`} />;
    case "register": return <Lock className={`${cls} text-primary`} />;
    default: return <Activity className={`${cls} text-muted-foreground`} />;
  }
}

function actionLabel(log: ActivityLog): string {
  const name = log.resourceName ? `"${log.resourceName}"` : "item";
  switch (log.action) {
    case "upload": return `Uploaded ${name}`;
    case "download": return `Downloaded ${name}`;
    case "delete": return `Moved ${name} to trash`;
    case "star": return `Starred ${name}`;
    case "unstar": return `Removed star from ${name}`;
    case "create_folder": return `Created folder ${name}`;
    case "restore": return `Restored ${name} from trash`;
    case "move": return `Moved ${name}`;
    case "rename": {
      const oldName = (log.metadata as any)?.oldName;
      return `Renamed${oldName ? ` "${oldName}"` : ""} to ${name}`;
    }
    case "share_folder": return `Shared folder ${name}`;
    case "create_share_link": return `Created share link for ${name}`;
    case "empty_trash": {
      const count = (log.metadata as any)?.count ?? 0;
      return `Emptied trash (${count} file${count !== 1 ? "s" : ""})`;
    }
    case "delete_folder": return `Deleted folder ${name}`;
    case "totp_enabled": return "Enabled two-factor authentication";
    case "totp_disabled": return "Disabled two-factor authentication";
    case "login": return "Signed in";
    case "register": return "Created account";
    default: return log.action.replace(/_/g, " ");
  }
}

export default function ActivityPage() {
  const [, setLocation] = useLocation();
  const [currentFilter, setCurrentFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const { error: authError } = useGetMe();
  const { data: foldersData } = useListFolders();
  const { data: activityData, isLoading } = useListActivity(100);

  if (authError) {
    setLocation("/login");
    return null;
  }

  const logs = activityData?.activity ?? [];
  const filtered = searchQuery
    ? logs.filter(l => actionLabel(l).toLowerCase().includes(searchQuery.toLowerCase()))
    : logs;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const resp = await fetch("/api/activity/export", { credentials: "include" });
      if (!resp.ok) throw new Error("Export failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foldr-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Your activity log has been downloaded." });
    } catch {
      toast({ variant: "destructive", title: "Export failed", description: "Could not download activity log." });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AppLayout
      currentFilter={currentFilter}
      onFilterChange={f => { setCurrentFilter(f); setLocation("/"); }}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      folders={foldersData?.folders}
      onFolderClick={() => setLocation("/")}
    >
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              Activity Log
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Your recent actions in foldr.storage</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="gap-2"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Export CSV
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Activity className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No activity yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Actions like uploads, downloads, and renames will appear here.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((log, i) => {
              const isNewDay = i === 0 || format(new Date(filtered[i - 1].createdAt), "yyyy-MM-dd") !== format(new Date(log.createdAt), "yyyy-MM-dd");
              return (
                <div key={log.id}>
                  {isNewDay && (
                    <div className="flex items-center gap-3 py-3 mt-2 first:mt-0">
                      <div className="h-px flex-1 bg-white/5" />
                      <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                        {format(new Date(log.createdAt), "MMMM d, yyyy")}
                      </span>
                      <div className="h-px flex-1 bg-white/5" />
                    </div>
                  )}
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.03] transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                      {actionIcon(log.action)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{actionLabel(log)}</p>
                    </div>
                    <span className="text-xs text-muted-foreground/60 flex-shrink-0 group-hover:text-muted-foreground transition-colors">
                      {format(new Date(log.createdAt), "h:mm a")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
