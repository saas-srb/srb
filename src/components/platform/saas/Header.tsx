"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Bot, Home, Layers, LogIn, Mail, Menu, Newspaper, Sparkles, Tag, Users, X, type LucideIcon } from "lucide-react";
import Logo from "@/components/platform/saas/Logo";
import { NAV_LINKS } from "@/lib/platform/saas/site";
import ThemeToggle from "@/components/platform/saas/ThemeToggle";

const ICON: Record<string, LucideIcon> = {
  "/": Home,
  "/products": Layers,
  "/features": Layers,
  "/pricing": Tag,
  "/docs": BookOpen,
  "/blog": Newspaper,
  "/about": Users,
  "/contact": Mail,
};

/** One-click header: nav links, Ask AI (navigates to ChatGPT-style Ask page), Log in and Get started free. */
export default function Header() {
  const path = usePathname() || "/";
  const [scrolled, setScrolled] = useState(false);
  // The mobile drawer belongs to the page it was opened on, so navigating closes it.
  const [drawerOn, setDrawerOn] = useState<string | null>(null);
  const drawer = drawerOn === path;
  const header = useRef<HTMLElement>(null);
  const [drawerTop, setDrawerTop] = useState(76);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.documentElement.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [drawer]);

  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  const isAskActive = path === "/ask" || path.startsWith("/ask/");

  return (
    <>
    <header ref={header} className={`sticky top-0 z-50 border-b transition-all duration-300 ${scrolled ? "border-border/50 bg-background/80 shadow-sm backdrop-blur-xl" : "border-transparent bg-background/60 backdrop-blur-md"}`}>
      <nav className="mx-auto flex h-[76px] max-w-[var(--sr-max)] items-center gap-6 px-6 lg:px-8" aria-label="Main">
        <Logo />
        <div className="ml-auto hidden items-center gap-0.5 lg:flex xl:gap-1">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={`relative whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-colors xl:px-3.5 ${
                active(l.href)
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted/60 hover:text-primary"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {(() => {
                  const I = ICON[l.href];
                  return I ? <I className="hidden h-[15px] w-[15px] opacity-70 xl:block" aria-hidden /> : null;
                })()}
                {l.label}
              </span>
            </Link>
          ))}

          {/* Ask AI — links to full-page chat experience with same header and footer */}
          <Link
            href="/ask"
            aria-current={isAskActive ? "page" : undefined}
            className={`relative ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-colors duration-200 ${
              isAskActive
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:text-primary hover:bg-muted/40"
            }`}
          >
            <Bot className={`h-4 w-4 ${isAskActive ? "text-primary" : "opacity-70"}`} />
            Ask AI
          </Link>

          <span className="mx-1.5 h-6 w-px bg-border" aria-hidden />
          <ThemeToggle />
          <Link href="/login" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:text-primary">
            <LogIn className="h-4 w-4 opacity-70" aria-hidden />Log in
          </Link>
          <Link href="/signup" className="group inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-all hover:scale-105 active:scale-95">
            <Sparkles className="h-4 w-4" /> Get started free
          </Link>
        </div>

        {/* Mobile Ask AI button — icon only, same size and styling as ThemeToggle */}
        <Link
          href="/ask"
          aria-label="Ask AI"
          title="Ask AI"
          className={`relative ml-auto flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:scale-105 active:scale-95 lg:hidden ${
            isAskActive
              ? "border-primary/50 bg-primary/15 text-primary shadow-sm"
              : "border-border/60 bg-muted/40 text-foreground hover:border-primary/50 hover:text-primary"
          }`}
        >
          <Bot className={`h-[18px] w-[18px] ${isAskActive ? "text-primary" : "opacity-70"}`} />
        </Link>

        <ThemeToggle className="lg:hidden" />
        <button
          type="button"
          onClick={() => { setDrawerTop(Math.max(0, Math.round(header.current?.getBoundingClientRect().bottom ?? 76))); setDrawerOn(drawer ? null : path); }}
          aria-label={drawer ? "Close menu" : "Open menu"}
          aria-expanded={drawer}
          className="rounded-full border border-border/50 bg-muted/30 p-2.5 transition-all hover:bg-muted/80 lg:hidden"
        >
          {drawer ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
    </header>

    {/* Outside the header: backdrop blur would otherwise become containing block */}
    <AnimatePresence>
      {drawer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-x-0 bottom-0 z-40 overflow-y-auto bg-background lg:hidden"
          style={{ top: drawerTop }}
        >
          <div className="mx-auto max-w-[var(--sr-max)] px-6 py-4">
            <ul>
              {NAV_LINKS.map((l) => (
                <li key={l.href} className="border-b border-border/50">
                  <Link href={l.href} onClick={() => setDrawerOn(null)} className="flex items-center gap-4 py-4">
                    <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-2xl ${active(l.href) ? "sr-icon" : "bg-muted text-muted-foreground"}`}>
                      {(() => {
                        const I = ICON[l.href];
                        return I ? <I className="h-5 w-5" aria-hidden /> : null;
                      })()}
                    </span>
                    <span>
                      <span className={`block text-lg font-bold ${active(l.href) ? "text-primary" : ""}`}>{l.label}</span>
                      <span className="block text-sm text-muted-foreground">{l.hint}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Ask AI — mobile drawer entry */}
            <Link
              href="/ask"
              onClick={() => setDrawerOn(null)}
              className="flex w-full items-center gap-4 border-t border-border/50 py-4 transition-colors"
            >
              <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-2xl ${isAskActive ? "sr-icon" : "bg-muted text-muted-foreground"}`}>
                <Bot className="h-5 w-5" aria-hidden />
              </span>
              <span className="flex-1">
                <span className={`block text-lg font-bold ${isAskActive ? "text-primary" : ""}`}>Ask AI</span>
                <span className="block text-sm text-muted-foreground">Chat with SelfRun AI assistant</span>
              </span>
            </Link>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Link href="/login" onClick={() => setDrawerOn(null)} className="inline-flex items-center justify-center gap-2 rounded-full border border-border/50 bg-muted/30 py-3 text-center text-sm font-bold">
                <LogIn className="h-4 w-4 opacity-70" />Log in
              </Link>
              <Link href="/signup" onClick={() => setDrawerOn(null)} className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground py-3 text-center text-sm font-bold text-background">
                <Sparkles className="h-4 w-4" />Get started free
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
