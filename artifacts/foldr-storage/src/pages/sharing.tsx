import { useState } from "react";
import { useLocation } from "wouter";
import {
  Share2,
  Link2,
  Loader2,
  Eye,
  Download,
  Clock,
  Trash2,
  Copy,
  CheckCheck,
  BarChart2,
  CalendarClock,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetMe,
  useListFolders,
  useAllShareLinks,
  useRevokeShareLink,
} from "@workspace/api-client-react";
import type { ShareLink } from "@workspace/api-client-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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

function ShareLinkCard({ link, onRevoke }: { link: ShareLink; onRevoke: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const isExpired = link.expiresAt ? isPast(new Date(link.expiresAt)) : false;
  const isMaxedOut = link.maxViews !== null && link.viewCount >= link.maxViews;
  const isActive = !isExpired && !isMaxedOut;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", title: "Copy failed" });
    }
  };

  return (
    <div className={`glass-panel p-4 rounded-2xl space-y-3 transition-all ${!isActive ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{link.fileName ?? "Unknown file"}</span>
            {link.label && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">{link.label}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono truncate">{link.url}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Badge variant={isActive ? "default" : "secondary"} className="text-[10px]">
            {isExpired ? "Expired" : isMaxedOut ? "Limit reached" : "Active"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Eye className="w-3.5 h-3.5" />
          <span>{link.viewCount} views</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Download className="w-3.5 h-3.5" />
          <span>{link.downloadCount} downloads</span>
        </div>
        {link.maxViews !== null && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BarChart2 className="w-3.5 h-3.5" />
            <span>{link.viewCount}/{link.maxViews} limit</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
          {link.expiresAt ? (
            <>
              <CalendarClock className="w-3.5 h-3.5" />
              <span>
                {isExpired
                  ? `Expired ${formatDistanceToNow(new Date(link.expiresAt), { addSuffix: true })}`
                  : `Expires ${formatDistanceToNow(new Date(link.expiresAt), { addSuffix: true })}`}
              </span>
            </>
          ) : (
            <>
              <Clock className="w-3.5 h-3.5" />
              <span>Created {format(new Date(link.createdAt), "MMM d, yyyy")}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={copyLink}
            title="Copy link"
          >
            {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onRevoke(link.id)}
            title="Revoke link"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SharingPage() {
  const [, setLocation] = useLocation();
  const [currentFilter, setCurrentFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const { toast } = useToast();
  const { error: authError } = useGetMe();
  const { data: foldersData } = useListFolders();
  const { data: shareData, isLoading } = useAllShareLinks();
  const revoke = useRevokeShareLink();

  if (authError) {
    setLocation("/login");
    return null;
  }

  const links = shareData?.shareLinks ?? [];
  const activeLinks = links.filter(l => {
    const expired = l.expiresAt ? isPast(new Date(l.expiresAt)) : false;
    const maxed = l.maxViews !== null && l.viewCount >= l.maxViews;
    return !expired && !maxed;
  });

  const handleRevoke = (id: string) => setRevokeId(id);

  const confirmRevoke = () => {
    if (!revokeId) return;
    revoke.mutate({ linkId: revokeId }, {
      onSuccess: () => {
        toast({ title: "Link revoked", description: "The share link has been deleted." });
        setRevokeId(null);
      },
      onError: (e: any) => {
        toast({ variant: "destructive", title: "Failed", description: e?.message ?? "Could not revoke link." });
        setRevokeId(null);
      },
    });
  };

  const totalViews = links.reduce((s, l) => s + l.viewCount, 0);
  const totalDownloads = links.reduce((s, l) => s + l.downloadCount, 0);

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
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Share2 className="w-6 h-6 text-primary" />
            Sharing Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all your share links and view analytics</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Links", value: links.length, icon: Link2 },
            { label: "Active Links", value: activeLinks.length, icon: Share2 },
            { label: "Total Views", value: totalViews, icon: Eye },
            { label: "Downloads", value: totalDownloads, icon: Download },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="glass-panel rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* Links list */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Share2 className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No share links yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Share a file from your dashboard to create a link.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {links.length} link{links.length !== 1 ? "s" : ""}
              </p>
            </div>
            {links.map(link => (
              <ShareLinkCard key={link.id} link={link} onRevoke={handleRevoke} />
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!revokeId} onOpenChange={open => !open && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke share link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the link. Anyone with this URL will no longer be able to access the file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevoke} className="bg-destructive hover:bg-destructive/90">
              {revoke.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
