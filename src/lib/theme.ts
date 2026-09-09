// Shared theme application: both windows (main widget and quick capture)
// must resolve the same dark/light decision or the two windows diverge.
export function applyTheme(theme: string) {
  const root = document.documentElement;
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}
