import { createContext, useContext } from "react";
import { useFolderSync } from "@/hooks/use-folder-sync";
import type { SyncState } from "@/hooks/use-folder-sync";

interface FolderSyncContextValue {
  state: SyncState;
  pickFolder: () => void;
  sync: () => void;
  disconnect: () => void;
}

const FolderSyncContext = createContext<FolderSyncContextValue | null>(null);

export function FolderSyncProvider({ children }: { children: React.ReactNode }) {
  const value = useFolderSync();
  return (
    <FolderSyncContext.Provider value={value}>
      {children}
    </FolderSyncContext.Provider>
  );
}

export function useFolderSyncCtx(): FolderSyncContextValue {
  const ctx = useContext(FolderSyncContext);
  if (!ctx) throw new Error("useFolderSyncCtx must be used inside FolderSyncProvider");
  return ctx;
}
