export type Theme = "light" | "dark";

const LS_THEME = "pg_theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(LS_THEME);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(LS_THEME, theme);
}

export function initTheme(): Theme {
  const theme = getInitialTheme();
  applyTheme(theme);
  return theme;
}
