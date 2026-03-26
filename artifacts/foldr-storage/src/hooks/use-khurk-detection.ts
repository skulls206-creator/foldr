import { useEffect, useState, useRef } from "react";

export interface KhurkThemePayload {
  theme: "dark" | "light" | string;
  accent?: string;
}

interface KhurkDetectionState {
  isEmbedded: boolean;
  dismissed: boolean;
  khurkPayload: KhurkThemePayload | null;
}

const SESSION_KEY = "foldr-khurk-banner-dismissed";

export function useKhurkDetection() {
  const [state, setState] = useState<KhurkDetectionState>(() => {
    const isEmbedded =
      typeof window !== "undefined" && window.self !== window.top;
    const dismissed =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(SESSION_KEY) === "1";
    return { isEmbedded, dismissed, khurkPayload: null };
  });

  const originRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state.isEmbedded) return;

    function onMessage(e: MessageEvent) {
      if (!e.data || e.data.type !== "KHURK_THEME") return;
      originRef.current = e.origin;
      setState(s => ({
        ...s,
        khurkPayload: { theme: e.data.theme ?? "dark", accent: e.data.accent },
      }));
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [state.isEmbedded]);

  function dismiss() {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
    setState(s => ({ ...s, dismissed: true }));
  }

  return {
    isEmbedded: state.isEmbedded,
    dismissed: state.dismissed,
    khurkPayload: state.khurkPayload,
    showBanner: state.isEmbedded && !state.dismissed,
    dismiss,
  };
}
