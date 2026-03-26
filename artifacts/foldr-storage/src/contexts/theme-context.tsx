import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AppTheme = "default" | "windows" | "khurk" | "cyberpunk" | "forest" | "sunset" | "ocean" | "pearl" | "crimson";

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  setTheme: () => {},
});

const ALL_THEME_CLASSES = [
  "theme-windows", "theme-khurk", "theme-cyberpunk",
  "theme-forest", "theme-sunset", "theme-ocean",
  "theme-pearl", "theme-crimson",
];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    try {
      return (localStorage.getItem("foldr-theme") as AppTheme) ?? "windows";
    } catch {
      return "windows";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...ALL_THEME_CLASSES);
    if (theme !== "default") {
      root.classList.add(`theme-${theme}`);
    }
    try { localStorage.setItem("foldr-theme", theme); } catch {}

    const themeColors: Record<AppTheme, string> = {
      default:   "#06080f",
      windows:   "#1c1c1c",
      khurk:     "#0b0d14",
      cyberpunk: "#0d0a14",
      forest:    "#0a0f0a",
      sunset:    "#130d08",
      ocean:     "#070d1a",
      pearl:     "#f8f7f5",
      crimson:   "#100608",
    };
    const metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = themeColors[theme];
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
