import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  Settings,
  Shield,
  Lock,
  Check,
  Loader2,
  AlertTriangle,
  QrCode,
  User,
  Globe,
  LogOut,
  Trash2,
  Palette,
  Monitor,
} from "lucide-react";
import { useTheme } from "@/contexts/theme-context";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useListFolders,
  useTotpSetup,
  useTotpConfirm,
  useDisableTotp,
  useLoginSessions,
  getGetMeQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";

type TotpStep = "idle" | "setup" | "confirm";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const [currentFilter, setCurrentFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const [totpStep, setTotpStep] = useState<TotpStep>("idle");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [secret, setSecret] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [isDisableAlertOpen, setIsDisableAlertOpen] = useState(false);

  const [displayNameInput, setDisplayNameInput] = useState<string | null>(null);
  const [timezoneInput, setTimezoneInput] = useState<string | null>(null);

  const [isRevokeAlertOpen, setIsRevokeAlertOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const { data: user, error: authError } = useGetMe();
  const { data: foldersData } = useListFolders();
  const { data: sessionsData } = useLoginSessions();
  const setupMutation = useTotpSetup();
  const confirmMutation = useTotpConfirm();
  const disableMutation = useDisableTotp();
  const { toast } = useToast();

  const updateProfileMutation = useMutation({
    mutationFn: (updates: { displayName?: string | null; timezone?: string | null }) =>
      customFetch<any>("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: ({ password }: { password: string }) =>
      customFetch<{ message: string }>("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }),
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: () =>
      customFetch<{ message: string }>("/api/auth/revoke-sessions", { method: "POST" }),
  });

  if (authError) {
    setLocation("/login");
    return null;
  }

  const currentDisplayName = (user as any)?.displayName ?? "";
  const currentTimezone = (user as any)?.timezone ?? "";
  const totpEnabled = (user as any)?.totpEnabled ?? false;

  const displayNameValue = displayNameInput !== null ? displayNameInput : currentDisplayName;
  const timezoneValue = timezoneInput !== null ? timezoneInput : currentTimezone;

  const profileDirty =
    (displayNameInput !== null && displayNameInput !== currentDisplayName) ||
    (timezoneInput !== null && timezoneInput !== currentTimezone);

  const handleSaveProfile = () => {
    const updates: { displayName?: string | null; timezone?: string | null } = {};
    if (displayNameInput !== null) updates.displayName = displayNameInput.trim() || null;
    if (timezoneInput !== null) updates.timezone = timezoneInput || null;

    updateProfileMutation.mutate(updates, {
      onSuccess: (updatedUser) => {
        toast({ title: "Profile updated", description: "Your changes have been saved." });
        setDisplayNameInput(null);
        setTimezoneInput(null);
        queryClient.setQueryData(getGetMeQueryKey(), updatedUser);
      },
      onError: (e: any) => {
        toast({ variant: "destructive", title: "Save failed", description: e?.message ?? "Could not save profile." });
      },
    });
  };

  const handleStartSetup = () => {
    setupMutation.mutate(undefined, {
      onSuccess: (data) => {
        setSecret(data.secret);
        setOtpauthUri(data.otpauthUri);
        setTotpStep("setup");
      },
      onError: (e: any) => {
        toast({ variant: "destructive", title: "Setup failed", description: e?.message ?? "Could not start 2FA setup." });
      },
    });
  };

  const handleConfirmSetup = () => {
    if (!confirmCode.trim()) return;
    confirmMutation.mutate({ code: confirmCode }, {
      onSuccess: () => {
        toast({ title: "2FA Enabled", description: "Two-factor authentication is now active." });
        setTotpStep("idle");
        setConfirmCode("");
        queryClient.setQueryData(getGetMeQueryKey(), (prev: any) =>
          prev ? { ...prev, totpEnabled: true } : prev
        );
      },
      onError: (e: any) => {
        toast({ variant: "destructive", title: "Invalid code", description: e?.message ?? "Please try again." });
      },
    });
  };

  const handleDisable = () => {
    disableMutation.mutate({ code: disableCode }, {
      onSuccess: () => {
        toast({ title: "2FA Disabled", description: "Two-factor authentication has been turned off." });
        setIsDisableAlertOpen(false);
        setDisableCode("");
        queryClient.setQueryData(getGetMeQueryKey(), (prev: any) =>
          prev ? { ...prev, totpEnabled: false } : prev
        );
      },
      onError: (e: any) => {
        toast({ variant: "destructive", title: "Failed", description: e?.message ?? "Invalid code." });
      },
    });
  };

  const handleRevokeSessions = () => {
    revokeSessionsMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Signed out everywhere", description: "All other sessions have been invalidated." });
        setIsRevokeAlertOpen(false);
        window.location.href = "/login";
      },
      onError: (e: any) => {
        toast({ variant: "destructive", title: "Failed", description: e?.message ?? "Could not revoke sessions." });
      },
    });
  };

  const handleDeleteAccount = () => {
    deleteAccountMutation.mutate({ password: deletePassword }, {
      onSuccess: () => {
        toast({ title: "Account deleted", description: "Your account has been permanently removed." });
        window.location.href = "/login";
      },
      onError: (e: any) => {
        toast({ variant: "destructive", title: "Failed", description: e?.message ?? "Incorrect password or server error." });
      },
    });
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
      <div className="max-w-2xl space-y-4">
        <div className="mb-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-5 h-5 text-muted-foreground" />
            Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage your account and security preferences</p>
        </div>

        {/* Appearance */}
        <section className="rounded-xl border border-white/5 bg-card/20 p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Palette className="w-3.5 h-3.5 text-primary" />
            Appearance
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">

            {/* Default */}
            <button onClick={() => setTheme("default")} className={`relative flex items-center gap-2 p-2 rounded-lg border-2 text-left transition-all duration-200 ${theme === "default" ? "border-cyan-400 bg-cyan-400/5" : "border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5"}`}>
              {theme === "default" && <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-cyan-400 flex items-center justify-center"><Check className="w-2 h-2 text-black" /></span>}
              <div className="w-9 h-7 rounded overflow-hidden bg-[#0a0a0f] border border-white/10 flex flex-shrink-0">
                <div className="w-2.5 bg-[#0d0d14] border-r border-white/5 flex flex-col gap-0.5 p-0.5">
                  <div className="w-full h-0.5 rounded-full bg-cyan-400/70" />
                  <div className="w-2/3 h-0.5 rounded-full bg-white/20" />
                  <div className="w-2/3 h-0.5 rounded-full bg-white/20" />
                </div>
                <div className="flex-1 p-0.5 flex flex-col gap-0.5">
                  <div className="w-full h-1 rounded bg-white/5" />
                  <div className="flex gap-0.5"><div className="w-1.5 h-1.5 rounded bg-yellow-400/70" /><div className="flex-1 h-0.5 mt-0.5 rounded-full bg-white/20" /></div>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Default</p>
                <p className="text-[9px] text-muted-foreground leading-tight truncate">Cyan · Glass</p>
              </div>
            </button>

            {/* Windows */}
            <button onClick={() => setTheme("windows")} className={`relative flex items-center gap-2 p-2 rounded-lg border-2 text-left transition-all duration-200 ${theme === "windows" ? "border-[#0078d4] bg-[#0078d4]/10" : "border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5"}`}>
              {theme === "windows" && <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded bg-[#0078d4] flex items-center justify-center"><Check className="w-2 h-2 text-white" /></span>}
              <div className="w-9 h-7 rounded overflow-hidden bg-[#212121] border border-[#383838] flex flex-shrink-0">
                <div className="w-2.5 bg-[#1f1f1f] border-r border-[#333] flex flex-col gap-0.5 p-0.5">
                  <div className="w-full h-0.5 rounded-sm bg-[#0078d4]/80" />
                  <div className="w-2/3 h-0.5 rounded-sm bg-white/20" />
                  <div className="w-2/3 h-0.5 rounded-sm bg-white/20" />
                </div>
                <div className="flex-1 p-0.5 flex flex-col gap-0.5">
                  <div className="w-full h-1 rounded-sm bg-[#2d2d2d]" />
                  <div className="flex gap-0.5"><div className="w-1.5 h-1.5 rounded-sm bg-yellow-400/80" /><div className="flex-1 h-0.5 mt-0.5 rounded-sm bg-white/20" /></div>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Windows</p>
                <p className="text-[9px] text-muted-foreground leading-tight truncate">Blue · Explorer</p>
              </div>
            </button>

            {/* Cyberpunk */}
            <button onClick={() => setTheme("cyberpunk")} className={`relative flex items-center gap-2 p-2 rounded-lg border-2 text-left transition-all duration-200 ${theme === "cyberpunk" ? "border-[#ff2d78] bg-[#ff2d78]/10" : "border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5"}`}>
              {theme === "cyberpunk" && <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded bg-[#ff2d78] flex items-center justify-center"><Check className="w-2 h-2 text-white" /></span>}
              <div className="w-9 h-7 rounded overflow-hidden bg-[#0d0a14] border border-[#2a1a30] flex flex-shrink-0">
                <div className="w-2.5 bg-[#0a0710] border-r border-[#251530] flex flex-col gap-0.5 p-0.5">
                  <div className="w-full h-0.5 rounded bg-[#ff2d78]/80" />
                  <div className="w-2/3 h-0.5 rounded bg-white/15" />
                  <div className="w-2/3 h-0.5 rounded bg-white/15" />
                </div>
                <div className="flex-1 p-0.5 flex flex-col gap-0.5">
                  <div className="w-full h-1 rounded bg-[#ff2d78]/10" />
                  <div className="flex gap-0.5"><div className="w-1.5 h-1.5 rounded bg-[#ff2d78]/70" /><div className="flex-1 h-0.5 mt-0.5 rounded bg-white/15" /></div>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Cyberpunk</p>
                <p className="text-[9px] text-muted-foreground leading-tight truncate">Pink · Neon</p>
              </div>
            </button>

            {/* Forest */}
            <button onClick={() => setTheme("forest")} className={`relative flex items-center gap-2 p-2 rounded-lg border-2 text-left transition-all duration-200 ${theme === "forest" ? "border-[#22c55e] bg-[#22c55e]/10" : "border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5"}`}>
              {theme === "forest" && <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded bg-[#22c55e] flex items-center justify-center"><Check className="w-2 h-2 text-black" /></span>}
              <div className="w-9 h-7 rounded overflow-hidden bg-[#0a0f0a] border border-[#162016] flex flex-shrink-0">
                <div className="w-2.5 bg-[#070c07] border-r border-[#131a13] flex flex-col gap-0.5 p-0.5">
                  <div className="w-full h-0.5 rounded bg-[#22c55e]/80" />
                  <div className="w-2/3 h-0.5 rounded bg-white/15" />
                  <div className="w-2/3 h-0.5 rounded bg-white/15" />
                </div>
                <div className="flex-1 p-0.5 flex flex-col gap-0.5">
                  <div className="w-full h-1 rounded bg-[#22c55e]/10" />
                  <div className="flex gap-0.5"><div className="w-1.5 h-1.5 rounded bg-[#22c55e]/70" /><div className="flex-1 h-0.5 mt-0.5 rounded bg-white/15" /></div>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Forest</p>
                <p className="text-[9px] text-muted-foreground leading-tight truncate">Green · Nature</p>
              </div>
            </button>

            {/* Sunset */}
            <button onClick={() => setTheme("sunset")} className={`relative flex items-center gap-2 p-2 rounded-lg border-2 text-left transition-all duration-200 ${theme === "sunset" ? "border-[#f97316] bg-[#f97316]/10" : "border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5"}`}>
              {theme === "sunset" && <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded bg-[#f97316] flex items-center justify-center"><Check className="w-2 h-2 text-white" /></span>}
              <div className="w-9 h-7 rounded overflow-hidden bg-[#130d08] border border-[#2a1a0a] flex flex-shrink-0">
                <div className="w-2.5 bg-[#0f0a05] border-r border-[#251508] flex flex-col gap-0.5 p-0.5">
                  <div className="w-full h-0.5 rounded bg-[#f97316]/80" />
                  <div className="w-2/3 h-0.5 rounded bg-white/15" />
                  <div className="w-2/3 h-0.5 rounded bg-white/15" />
                </div>
                <div className="flex-1 p-0.5 flex flex-col gap-0.5">
                  <div className="w-full h-1 rounded bg-[#f97316]/10" />
                  <div className="flex gap-0.5"><div className="w-1.5 h-1.5 rounded bg-[#fbbf24]/70" /><div className="flex-1 h-0.5 mt-0.5 rounded bg-white/15" /></div>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Sunset</p>
                <p className="text-[9px] text-muted-foreground leading-tight truncate">Orange · Warm</p>
              </div>
            </button>

            {/* Ocean */}
            <button onClick={() => setTheme("ocean")} className={`relative flex items-center gap-2 p-2 rounded-lg border-2 text-left transition-all duration-200 ${theme === "ocean" ? "border-[#06b6d4] bg-[#06b6d4]/10" : "border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5"}`}>
              {theme === "ocean" && <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded bg-[#06b6d4] flex items-center justify-center"><Check className="w-2 h-2 text-black" /></span>}
              <div className="w-9 h-7 rounded overflow-hidden bg-[#070d1a] border border-[#0f1e35] flex flex-shrink-0">
                <div className="w-2.5 bg-[#050a14] border-r border-[#0c1a2e] flex flex-col gap-0.5 p-0.5">
                  <div className="w-full h-0.5 rounded bg-[#06b6d4]/80" />
                  <div className="w-2/3 h-0.5 rounded bg-white/15" />
                  <div className="w-2/3 h-0.5 rounded bg-white/15" />
                </div>
                <div className="flex-1 p-0.5 flex flex-col gap-0.5">
                  <div className="w-full h-1 rounded bg-[#06b6d4]/10" />
                  <div className="flex gap-0.5"><div className="w-1.5 h-1.5 rounded bg-[#38bdf8]/70" /><div className="flex-1 h-0.5 mt-0.5 rounded bg-white/15" /></div>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Ocean</p>
                <p className="text-[9px] text-muted-foreground leading-tight truncate">Teal · Deep</p>
              </div>
            </button>

            {/* Pearl */}
            <button onClick={() => setTheme("pearl")} className={`relative flex items-center gap-2 p-2 rounded-lg border-2 text-left transition-all duration-200 ${theme === "pearl" ? "border-[#4f6ef7] bg-[#4f6ef7]/10" : "border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5"}`}>
              {theme === "pearl" && <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded bg-[#4f6ef7] flex items-center justify-center"><Check className="w-2 h-2 text-white" /></span>}
              <div className="w-9 h-7 rounded overflow-hidden bg-[#f8f7f5] border border-[#ddd8d2] flex flex-shrink-0">
                <div className="w-2.5 bg-[#ebe8e4] border-r border-[#d4cfc9] flex flex-col gap-0.5 p-0.5">
                  <div className="w-full h-0.5 rounded bg-[#4f6ef7]/80" />
                  <div className="w-2/3 h-0.5 rounded bg-black/15" />
                  <div className="w-2/3 h-0.5 rounded bg-black/15" />
                </div>
                <div className="flex-1 p-0.5 flex flex-col gap-0.5">
                  <div className="w-full h-1 rounded bg-[#4f6ef7]/12" />
                  <div className="flex gap-0.5"><div className="w-1.5 h-1.5 rounded bg-[#f97316]/70" /><div className="flex-1 h-0.5 mt-0.5 rounded bg-black/12" /></div>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Pearl</p>
                <p className="text-[9px] text-muted-foreground leading-tight truncate">Blue · Light</p>
              </div>
            </button>

            {/* Crimson */}
            <button onClick={() => setTheme("crimson")} className={`relative flex items-center gap-2 p-2 rounded-lg border-2 text-left transition-all duration-200 ${theme === "crimson" ? "border-[#dc1a3c] bg-[#dc1a3c]/10" : "border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5"}`}>
              {theme === "crimson" && <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded bg-[#dc1a3c] flex items-center justify-center"><Check className="w-2 h-2 text-white" /></span>}
              <div className="w-9 h-7 rounded overflow-hidden bg-[#100608] border border-[#2e1018] flex flex-shrink-0">
                <div className="w-2.5 bg-[#0d0507] border-r border-[#251018] flex flex-col gap-0.5 p-0.5">
                  <div className="w-full h-0.5 rounded bg-[#dc1a3c]/80" />
                  <div className="w-2/3 h-0.5 rounded bg-white/15" />
                  <div className="w-2/3 h-0.5 rounded bg-white/15" />
                </div>
                <div className="flex-1 p-0.5 flex flex-col gap-0.5">
                  <div className="w-full h-1 rounded bg-[#dc1a3c]/10" />
                  <div className="flex gap-0.5"><div className="w-1.5 h-1.5 rounded bg-[#dc1a3c]/70" /><div className="flex-1 h-0.5 mt-0.5 rounded bg-white/15" /></div>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Crimson</p>
                <p className="text-[9px] text-muted-foreground leading-tight truncate">Red · Bold</p>
              </div>
            </button>

          </div>
        </section>

        {/* Account Info */}
        <section className="rounded-xl border border-white/5 bg-card/20 p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-primary" />
            Account
          </h2>
          <div className="space-y-0.5">
            <Label className="text-muted-foreground text-[10px] uppercase tracking-wider">Email</Label>
            <p className="text-sm font-medium">{user?.email}</p>
          </div>
          <div className="rounded-lg p-2.5 bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex gap-2 items-start">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">No password recovery — </span>
              <span className="text-amber-200/70">foldr does not send emails or support password recovery. Store your credentials safely.</span>
            </div>
          </div>
        </section>

        {/* Profile */}
        <section className="rounded-xl border border-white/5 bg-card/20 p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-primary" />
            Profile
          </h2>

          <div className="space-y-1">
            <Label htmlFor="display-name" className="text-xs">Display Name</Label>
            <Input
              id="display-name"
              placeholder="Your name (shown in the sidebar)"
              value={displayNameValue}
              onChange={e => setDisplayNameInput(e.target.value)}
              className="bg-black/30 border-white/10 max-w-sm h-8 text-sm"
            />
            <p className="text-[11px] text-muted-foreground/70">If set, this replaces your email in the sidebar.</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="timezone" className="text-xs flex items-center gap-1.5">
              <Globe className="w-3 h-3 text-muted-foreground" />
              Default Timezone
            </Label>
            <select
              id="timezone"
              value={timezoneValue}
              onChange={e => setTimezoneInput(e.target.value)}
              className="flex h-8 w-full max-w-sm rounded-md border border-white/10 bg-black/30 px-2.5 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
            >
              <option value="">System default</option>
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            onClick={handleSaveProfile}
            disabled={!profileDirty || updateProfileMutation.isPending}
            className="gap-1.5 h-7 text-xs px-3"
          >
            {updateProfileMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Save Profile
          </Button>
        </section>

        {/* Two-factor Authentication */}
        <section className="rounded-xl border border-white/5 bg-card/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-primary" />
              Two-Factor Authentication
            </h2>
            {totpEnabled && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[10px] font-semibold">
                <Check className="w-2.5 h-2.5" /> Enabled
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Add an extra layer of security with a time-based authenticator app.
          </p>

          {!totpEnabled && totpStep === "idle" && (
            <Button size="sm" onClick={handleStartSetup} disabled={setupMutation.isPending} className="gap-1.5 h-7 text-xs px-3">
              {setupMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <QrCode className="w-3 h-3" />}
              Set up 2FA
            </Button>
          )}

          {totpStep === "setup" && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>1. Install an authenticator app (Google Authenticator, Authy, 1Password, etc.)</p>
                <p>2. Scan the QR code below or enter the secret manually</p>
                <p>3. Enter the 6-digit code to verify and enable 2FA</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-white rounded-xl flex-shrink-0">
                  <QRCodeSVG value={otpauthUri} size={120} />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <p className="text-[11px] text-muted-foreground">Manual entry key</p>
                  <code className="text-[11px] font-mono bg-black/30 px-2.5 py-1.5 rounded-lg block tracking-wider break-all">
                    {secret}
                  </code>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="totp-code" className="text-xs">Verification Code</Label>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    id="totp-code"
                    value={confirmCode}
                    onChange={e => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="font-mono text-base tracking-widest text-center bg-black/30 border-white/10 h-8 w-28"
                    maxLength={6}
                    onKeyDown={e => e.key === "Enter" && handleConfirmSetup()}
                  />
                  <Button size="sm" onClick={handleConfirmSetup} disabled={confirmMutation.isPending || confirmCode.length !== 6} className="h-8 text-xs px-3">
                    {confirmMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Verify & Enable"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setTotpStep("idle"); setConfirmCode(""); }} className="h-8 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {totpEnabled && (
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 h-7 text-xs px-3"
              onClick={() => setIsDisableAlertOpen(true)}
            >
              Disable 2FA
            </Button>
          )}
        </section>

        {/* Login History */}
        <section className="rounded-xl border border-white/5 bg-card/20 p-4 space-y-2.5">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Monitor className="w-3.5 h-3.5 text-primary" />
            Login History
          </h2>
          {(() => {
            const sessions = sessionsData?.sessions ?? [];
            if (sessions.length === 0) {
              return <p className="text-xs text-muted-foreground/60 italic">No login history available.</p>;
            }
            return (
              <div className="rounded-lg border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
                {sessions.slice(0, 10).map((s, i) => (
                  <div key={s.id} className={`flex items-center gap-2.5 py-1.5 px-3 text-sm ${i === 0 ? "bg-primary/[0.05]" : ""}`}>
                    <Monitor className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-muted-foreground truncate" title={s.userAgent ?? undefined}>
                        {s.userAgent ? s.userAgent.slice(0, 80) : "Unknown browser"}
                      </p>
                      <p className="text-[11px] text-muted-foreground/50">
                        {s.ipAddress ?? "Unknown IP"} · {format(new Date(s.createdAt), "MMM d, yyyy · h:mm a")}
                      </p>
                    </div>
                    {i === 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold flex-shrink-0">Current</span>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </section>

        {/* Sessions */}
        <section className="rounded-xl border border-white/5 bg-card/20 p-4 space-y-2.5">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <LogOut className="w-3.5 h-3.5 text-primary" />
            Sessions
          </h2>
          <p className="text-xs text-muted-foreground">
            Sign out of all devices and browsers. You will need to log in again on every device.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-white/10 hover:border-white/20 gap-1.5 h-7 text-xs px-3"
            onClick={() => setIsRevokeAlertOpen(true)}
          >
            <LogOut className="w-3 h-3" />
            Sign Out Everywhere
          </Button>
        </section>

        {/* Danger Zone */}
        <section className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-2.5">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
            Danger Zone
          </h2>
          <p className="text-xs text-muted-foreground">
            Permanently delete your account. All files, folders, and data will be removed. This action <strong className="text-foreground">cannot be undone</strong>.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive gap-1.5 h-7 text-xs px-3"
            onClick={() => { setDeletePassword(""); setIsDeleteAlertOpen(true); }}
          >
            <Trash2 className="w-3 h-3" />
            Delete My Account
          </Button>
        </section>
      </div>
      {/* Disable 2FA Dialog */}
      <AlertDialog open={isDisableAlertOpen} onOpenChange={setIsDisableAlertOpen}>
        <AlertDialogContent className="bg-card border-white/10 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Two-Factor Authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              Enter your current authenticator code to confirm. This will remove the extra layer of security from your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="disable-code">Authentication Code</Label>
            <Input
              id="disable-code"
              value={disableCode}
              onChange={e => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="font-mono text-lg tracking-widest text-center bg-black/30 border-white/10 h-12 max-w-36"
              maxLength={6}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDisableCode("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisable}
              disabled={disableMutation.isPending || disableCode.length !== 6}
              className="bg-destructive hover:bg-destructive/90"
            >
              {disableMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disable 2FA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Revoke Sessions Dialog */}
      <AlertDialog open={isRevokeAlertOpen} onOpenChange={setIsRevokeAlertOpen}>
        <AlertDialogContent className="bg-card border-white/10 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Out of All Sessions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will invalidate all active sessions across every device and browser, including this one. You will be redirected to the login page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeSessions}
              disabled={revokeSessionsMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {revokeSessionsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign Out Everywhere"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Delete Account Dialog */}
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent className="bg-card border-white/10 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete Account Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account and all files stored in foldr.storage. This action <strong>cannot be undone</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-password">Confirm your password</Label>
            <Input
              id="delete-password"
              type="password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              placeholder="Enter your password"
              className="bg-black/30 border-white/10"
              onKeyDown={e => e.key === "Enter" && deletePassword && handleDeleteAccount()}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletePassword("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleteAccountMutation.isPending || !deletePassword}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteAccountMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete My Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
