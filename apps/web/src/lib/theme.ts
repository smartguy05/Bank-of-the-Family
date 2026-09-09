/**
 * Theme preference handling. The preference ("system" follows the OS) is persisted in
 * localStorage and reflected onto `<html data-theme>`, which flips the CSS variables in styles.css.
 * An inline script in index.html applies the same logic before first paint to avoid a flash.
 */

export type ThemePref = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "botf-theme";

export function getStoredTheme(): ThemePref {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Storage can be unavailable (private mode, disabled cookies) — fall back to the default.
  }
  return "system";
}

export function storeTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Ignore: the theme still applies for this session, it just won't be remembered.
  }
}

/** Resolve a preference to the concrete theme, consulting the OS when "system". */
export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

/** Reflect a preference onto `<html data-theme>` so the CSS variables switch. */
export function applyTheme(pref: ThemePref): void {
  document.documentElement.dataset.theme = resolveTheme(pref);
}
