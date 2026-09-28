import { useState } from "react";

type Theme = "light" | "dark";

const stored = (): Theme => {
  try { return localStorage.getItem("theme") === "dark" ? "dark" : "light"; } catch { return "light"; }
};

export const applyTheme = (t: Theme = stored()) => {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(t);
};

// tema claro é o padrão
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(stored);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", next); } catch { /* sem storage: vale só nesta aba */ }
    applyTheme(next);
    setTheme(next);
  };
  return { theme, toggle };
}
