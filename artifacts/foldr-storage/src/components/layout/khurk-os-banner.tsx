import { X, Layers } from "lucide-react";
import { useKhurkDetection } from "@/hooks/use-khurk-detection";
import { useTheme } from "@/contexts/theme-context";

export function KhurkOSBanner() {
  const { showBanner, khurkPayload, dismiss } = useKhurkDetection();
  const { setTheme } = useTheme();

  if (!showBanner) return null;

  function applyTheme() {
    setTheme("khurk");
    if (khurkPayload?.accent) {
      document.documentElement.style.setProperty("--khurk-accent", khurkPayload.accent);
    }
    dismiss();
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#0e1117] border-b border-[#5865F2]/30 text-sm z-50 flex-shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex-shrink-0 w-6 h-6 rounded-md bg-[#5865F2]/20 flex items-center justify-center">
          <Layers className="w-3.5 h-3.5 text-[#5865F2]" />
        </div>
        <span className="text-foreground/80 truncate">
          Looks like you&apos;re in{" "}
          <span className="font-semibold text-[#5865F2]">KHURK OS</span>
          {" "}— want to switch to a theme that fits?
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={applyTheme}
          className="px-3 py-1 rounded-md bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold transition-colors"
        >
          Yes, apply
        </button>
        <button
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
