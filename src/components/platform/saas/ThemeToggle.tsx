"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "sr-theme";

/** Light / dark switch for the product website. The choice is saved in this browser and applied before the page paints. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".sr");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(root?.getAttribute("data-theme") === "dark");
  }, []);
  const toggle = () => {
    const root = document.querySelector<HTMLElement>(".sr");
    if (!root) return;
    const next = !dark;
    root.classList.toggle("dark", next);
    // the product's products, the 404 and loading screens live outside this wrapper: they follow the class on <html>
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    if (next) root.setAttribute("data-theme", "dark"); else root.removeAttribute("data-theme");
    try { localStorage.setItem(KEY, next ? "dark" : "light"); } catch {}
    setDark(next);
  };
  return (
    <button type="button" onClick={toggle} role="switch" aria-checked={dark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-foreground transition-all hover:scale-105 hover:border-primary/50 hover:text-primary ${className}`}>
      <Sun className={`absolute h-[18px] w-[18px] transition-all duration-300 ${dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`} />
      <Moon className={`absolute h-[18px] w-[18px] transition-all duration-300 ${dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`} />
    </button>
  );
}
