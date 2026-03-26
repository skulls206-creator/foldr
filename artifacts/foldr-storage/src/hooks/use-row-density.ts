import { useState, useCallback } from "react";

export type RowDensity = "comfortable" | "cozy" | "compact";

const STORAGE_KEY = "foldr-row-density";
const DEFAULT: RowDensity = "comfortable";

function read(): RowDensity {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "comfortable" || v === "cozy" || v === "compact") return v;
  } catch { /* SSR / private mode */ }
  return DEFAULT;
}

export function useRowDensity() {
  const [density, setDensityState] = useState<RowDensity>(read);

  const setDensity = useCallback((d: RowDensity) => {
    setDensityState(d);
    try { localStorage.setItem(STORAGE_KEY, d); } catch { /* ignore */ }
  }, []);

  return { density, setDensity };
}

// ── Utility: derive Tailwind classes from density ─────────────────────────

export interface DensityClasses {
  rowPy: string;
  iconSize: string;
  iconWrap: string;
  gap: string;
}

export function getDensityClasses(density: RowDensity): DensityClasses {
  switch (density) {
    case "compact":
      return {
        rowPy: "py-0.5 px-3",
        iconSize: "w-3.5 h-3.5",
        iconWrap: "p-0.5",
        gap: "gap-2",
      };
    case "cozy":
      return {
        rowPy: "py-1 px-3",
        iconSize: "w-3.5 h-3.5",
        iconWrap: "p-1",
        gap: "gap-2.5",
      };
    default: // comfortable
      return {
        rowPy: "py-1.5 px-3",
        iconSize: "w-4 h-4",
        iconWrap: "p-1.5",
        gap: "gap-3",
      };
  }
}
