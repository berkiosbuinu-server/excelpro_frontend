// Préférence d'apparence : automatique (système), clair ou sombre. Appliquée via l'attribut data-theme sur <html>.
export type ThemePref = "auto" | "light" | "dark";
const KEY = "excelpro_theme";

export function getTheme(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "auto"; } catch { return "auto"; }
}

export function applyTheme(t: ThemePref) {
  const root = document.documentElement;
  if (t === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
  try { if (t === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* stockage indisponible */ }
  const dark = t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0c1310" : "#0f8a52");
}
