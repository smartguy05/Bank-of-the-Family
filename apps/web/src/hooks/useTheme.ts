import { useCallback, useEffect, useState } from "react";
import { applyTheme, getStoredTheme, storeTheme, type ThemePref } from "@/lib/theme";

/**
 * Reads and writes the theme preference. Applies it on change and, while on "system", keeps the
 * page in sync with live OS light/dark changes.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemePref>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((pref: ThemePref) => {
    storeTheme(pref);
    setThemeState(pref);
  }, []);

  return { theme, setTheme };
}
