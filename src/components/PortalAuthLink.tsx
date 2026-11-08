"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, ChevronDown, LayoutDashboard, UserRound, UserPlus } from "lucide-react";
import NavDropdown, { type DropdownNav } from "@/components/header/NavDropdown";
import { PORTAL_SESSION_CHANGED_EVENT } from "@/components/chat/ChatProvider";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";

type Session = { signedIn: boolean; firstName: string | null; companyLoginUrl?: string | null } | null;

/**
 * Public-header account entry: an "Account" menu for visitors that keeps the two kinds of sign-in apart — the company's own team
 * (sent to the company's products domain) and visitors/customers (the user login on this site) — and "Dashboard" for
 * signed-in portal users. Checked client-side (one tiny no-store request) so
 * the public pages stay statically renderable. Renders nothing until known,
 * so a signed-in user never sees a flash of "Login".
 *
 * Also re-checks on `portal:session-changed` — fired by the Ask AI chat when
 * the pre-chat form auto-creates and signs in an account — so this flips to
 * Dashboard immediately without a page reload or leaving the chat.
 */
export default function PortalAuthLink({ variant, onNavigate, menuStyle = "default" }: { variant: "desktop" | "mobile"; onNavigate?: () => void; menuStyle?: string }) {
  const [session, setSession] = useState<Session>(null);
  const { header } = useSiteInfo();

  const refresh = useCallback(() => {
    fetch("/api/clientos/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setSession(j))
      .catch(() => setSession({ signedIn: false, firstName: null }));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(PORTAL_SESSION_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PORTAL_SESSION_CHANGED_EVENT, refresh);
  }, [refresh]);

  if (!session) return variant === "desktop" ? <span className="h-9 w-28" aria-hidden /> : null;

  if (session.signedIn) {
    return variant === "desktop" ? (
      <Link href="/clientos" className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
        <LayoutDashboard className="h-4 w-4" />{` ${header.dashboardLabel}`}
      </Link>
    ) : (
      <Link href="/clientos" onClick={onNavigate} className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-3.5 text-base font-semibold text-primary">
        <LayoutDashboard className="h-5 w-5" />{` ${header.dashboardLabel}`}{session.firstName ? ` · ${session.firstName}` : ""}
      </Link>
    );
  }

  const nav = accountNav(session.companyLoginUrl ?? null);
  return variant === "desktop" ? <AccountMenu nav={nav} menuStyle={menuStyle} /> : <AccountAccordion nav={nav} onNavigate={onNavigate} />;
}

/** The two kinds of sign-in, plus sign-up, as ordinary menu entries — so they follow whatever dropdown style the site's theme uses. */
function accountNav(companyLoginUrl: string | null): DropdownNav {
  const items = [
    ...(companyLoginUrl ? [{ name: "Company login", href: companyLoginUrl, description: "For this company's team and admins", icon: Building2 }] : []),
    { name: "User login", href: "/login", description: "For customers, students, applicants and clients", icon: UserRound },
    { name: "Create user account", href: "/register", description: "New here? Make a free user account", icon: UserPlus },
  ];
  return { name: "Account", href: "/login", items };
}

/** Same trigger, hover behaviour and product as the site's other menu items (the product style comes from the theme's menu style). */
function AccountMenu({ nav, menuStyle }: { nav: DropdownNav; menuStyle: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className={`py-2 ${menuStyle === "tiles" ? "" : "relative"}`} onMouseEnter={() => setOpen(true)} onMouseLeave={close} onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-semibold transition-colors duration-200 ${open ? "bg-muted/60 text-primary" : "text-foreground hover:bg-muted/40 hover:text-primary"}`}
      >
        <UserRound className="h-4 w-4 text-primary" />
        {nav.name}
        <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && menuStyle !== "default" && <NavDropdown style={menuStyle} nav={nav} hideViewAll />}
        {open && menuStyle === "default" && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-0 top-full z-50 mt-2 w-[22rem]"
          >
            <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-background/95 shadow-2xl ring-1 ring-border backdrop-blur-2xl dark:bg-muted/20">
              <div className="h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
              <div className="space-y-1 p-3">
                {nav.items.map((item) => (
                  <Link key={item.name} href={item.href} onClick={close} className="group relative flex items-start gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-muted/50">
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-border/50 bg-gradient-to-br from-primary/10 to-secondary/10 transition-all duration-300 group-hover:rotate-3 group-hover:scale-110 group-hover:border-primary group-hover:from-primary group-hover:to-brand-accent group-hover:shadow-lg group-hover:shadow-primary/20">
                      <item.icon className="h-4 w-4 text-muted-foreground transition-colors duration-300 group-hover:text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 whitespace-nowrap text-sm font-semibold text-foreground transition-colors group-hover:text-primary">{item.name}</div>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The slide-out menu's accordion, built like its other sections. */
function AccountAccordion({ nav, onNavigate }: { nav: DropdownNav; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-y border-border/50">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 py-4" aria-expanded={open}>
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-border/50 text-muted-foreground"><UserRound className="h-4 w-4" /></span>
          <span className="text-base font-bold text-foreground">{nav.name}</span>
        </span>
        <ChevronDown className={`h-5 w-5 flex-none text-muted-foreground transition-transform duration-300 ${open ? "rotate-180 text-primary" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="overflow-hidden">
            <div className="space-y-1 pb-4 pl-[3.25rem]">
              {nav.items.map((item) => (
                <Link key={item.name} href={item.href} onClick={onNavigate} className="flex items-center gap-3 rounded-r-lg border-l-2 border-transparent py-2.5 pl-3 pr-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-primary">
                  <item.icon className="h-4 w-4 flex-none" />
                  <span className="min-w-0"><span className="block font-medium text-foreground">{item.name}</span><span className="block text-xs">{item.description}</span></span>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
