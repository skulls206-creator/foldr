import { useState, useEffect } from "react";

type InstallState =
  | { type: "unsupported" }
  | { type: "ios" }
  | { type: "available"; prompt: () => void }
  | { type: "installed" };

export function usePwaInstall(): InstallState {
  const [state, setState] = useState<InstallState>({ type: "unsupported" });

  useEffect(() => {
    // Already installed as standalone app
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setState({ type: "installed" });
      return;
    }

    // iOS detection — Safari on iPhone/iPad doesn't support beforeinstallprompt
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;
    const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);
    if (isIos && isSafari) {
      setState({ type: "ios" });
      return;
    }

    // Standard install prompt (Chrome, Edge, Samsung Browser, Android Chrome)
    const handler = (e: Event) => {
      e.preventDefault();
      const deferredPrompt = e as any;
      setState({
        type: "available",
        prompt: () => {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(() => {
            setState({ type: "installed" });
          });
        },
      });
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  return state;
}
