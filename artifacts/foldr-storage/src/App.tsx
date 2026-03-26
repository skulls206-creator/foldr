import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/theme-context";
import { FolderSyncProvider } from "@/contexts/folder-sync-context";
import { setAuthTokenGetter } from "@workspace/api-client-react";

// Register the localStorage bearer-token getter once at module load.
// In normal browser sessions the cookie handles auth, but inside cross-site
// iframes (e.g. KHURK OS) third-party cookies are blocked — the getter makes
// every customFetch call attach Authorization: Bearer <token> as a fallback.
setAuthTokenGetter(() => localStorage.getItem("foldr-auth-token"));

// Pages
import Dashboard from "@/pages/dashboard";
import AuthPage from "@/pages/auth";
import SharePage from "@/pages/share";
import TrashPage from "@/pages/trash";
import ActivityPage from "@/pages/activity";
import SettingsPage from "@/pages/settings";
import SharingPage from "@/pages/sharing";
import SharedFolderPage from "@/pages/shared-folder";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    }
  }
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/login" component={AuthPage} />
      <Route path="/share/:token" component={SharePage} />
      <Route path="/trash" component={TrashPage} />
      <Route path="/activity" component={ActivityPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/sharing" component={SharingPage} />
      <Route path="/shared-folder/:token" component={SharedFolderPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <FolderSyncProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </FolderSyncProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
