"use client";

import * as React from "react";
import Link from "next/link";
import PortalAuthLink from "@/components/PortalAuthLink";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";
import { Menu, X, ChevronDown, Moon, Sun, ArrowRight, Zap, Monitor, Smartphone, Cpu, Box, Code2, Database, Sparkles, Bot, MessageSquare, ScanEye, Compass, Briefcase, Layers, Glasses, Eye, GraduationCap, Building2, Landmark, Calendar, Mail, Phone, Globe, HeartPulse, ShoppingCart, Umbrella, Tractor, Share2, Plane, Hotel, Palette, Handshake, Users, UserPlus, UserCheck, Clock, Target, Newspaper, Workflow, BarChart3, FileSearch, TrendingUp, Plug, BrainCircuit, Megaphone, FileQuestion, Kanban, Filter, ShieldCheck, FileText } from "lucide-react";
import { useTheme } from "next-themes";
import { WhatsAppIcon } from "@/components/icons/SocialIcons";
import SiteLogo from "@/components/SiteLogo";
import NavDropdown from "@/components/header/NavDropdown";
import { socialIconFor } from "@/components/icons/social-icon-for";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";
import type { SiteInfo } from "@/lib/products/sitecraft-ai/site-info-shared";
import { loadAndToggleTawk } from "@/lib/tawk";
import { resolveIcon } from "@/lib/products/sitecraft-ai/icon-map";
import type { PublicNavTop } from "@/lib/products/sitecraft-ai/nav";
import { isProductsHref, SIGNUP_PATH } from "@/lib/products/shared";
import { resolveProductsText } from "@/lib/products/text";

const mobileContactLinksFor = (header: SiteInfo["header"], whatsappHref: string, liveChatId?: string) =>
  [
    header.consultLabel && header.consultHref ? { name: header.consultLabel, type: "link" as const, href: header.consultHref, icon: Calendar } : null,
    header.liveChatLabel && liveChatId ? { name: header.liveChatLabel, type: "action" as const, icon: MessageSquare } : null,
    header.whatsappLabel && whatsappHref ? { name: header.whatsappLabel, type: "external" as const, href: whatsappHref, icon: WhatsAppIcon } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

/** A desktop mega-menu column, resolved from the CMS navigation. */
interface NavColumn {
  name: string;
  href: string;
  featured: { title: string; description: string; image: string; href?: string | null };
  items: { name: string; href: string; description: string; icon: React.ComponentType<{ className?: string }> }[];
}

/** A menu's featured card can carry one extra call to action (the Products menu: sign up for the business-automation SaaS). */
interface FeaturedCta {
  label: string;
  href: string;
  viewAllLabel: string;
}

function FeaturedCard({ item, featuredLabel, cta }: { item: NavColumn; featuredLabel: string; cta?: FeaturedCta }) {
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const springConfig = { stiffness: 200, damping: 20, mass: 0.5 };
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [6, -6]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-6, 6]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };
  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      className="col-span-2 group/card relative"
    >
      <Link
        href={item.featured.href || item.href}
        className="block h-full p-6 rounded-2xl relative overflow-hidden isolate ring-1 ring-border/50 hover:ring-primary/40 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/25"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.featured.image}
          alt={item.featured.title}
          className="absolute inset-0 w-full h-full object-cover scale-105 group-hover/card:scale-110 transition-transform duration-700 ease-out"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/10 group-hover/card:from-black/95 transition-colors duration-500" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-secondary/30 mix-blend-overlay opacity-80" />

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-y-0 -left-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent -skew-x-12 -translate-x-full group-hover/card:translate-x-[350%] transition-transform duration-1000 ease-out" />
        </div>

        <span className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white ring-1 ring-white/20">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          {featuredLabel}
        </span>

        <div className={`relative z-10 h-full min-h-[200px] flex flex-col justify-end ${cta ? "pb-14" : ""}`} style={{ transform: "translateZ(20px)" }}>
          <h3 className="text-xl font-bold text-white mb-2 group-hover/card:translate-x-0.5 transition-transform duration-300">
            {item.featured.title}
          </h3>
          <p className="text-sm text-white/70 mb-4">{item.featured.description}</p>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
            {cta ? cta.viewAllLabel : item.featured.href && item.featured.href !== item.href ? `Explore ${item.featured.title}` : `View all ${item.name}`}
            <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center group-hover/card:bg-primary transition-colors duration-300">
              <ArrowRight className="w-3.5 h-3.5 group-hover/card:translate-x-0.5 transition-transform" />
            </span>
          </span>
        </div>
      </Link>
      {cta && (
        // A sibling of the card's own link (links cannot nest), laid over its bottom edge.
        <Link
          href={cta.href}
          className="absolute bottom-6 left-6 z-20 inline-flex max-w-[calc(100%-3rem)] items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-black shadow-lg transition-all hover:scale-105 hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <span className="truncate">{cta.label}</span>
          <ArrowRight className="h-3.5 w-3.5 flex-none" />
        </Link>
      )}
    </motion.div>
  );
}

/**
 * `variant` is chosen per theme in the CMS (src/lib/sitecraft-ai/component-variants.ts):
 * "default" is the site's standard header; "menu" drops the desktop nav bar
 * and uses the slide-out menu at every screen width; "centered" puts the logo
 * above a centered nav row; "floating" is a rounded bar floating over the page.
 */
export type HeaderVariant = "default" | "menu" | "centered" | "floating";

export default function Header({ cmsNavigation, variant = "default", menuStyle = "default" }: { cmsNavigation: PublicNavTop[]; variant?: HeaderVariant; menuStyle?: string }) {
  const menuOnly = variant === "menu";
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  // Brand, CTA, contact details and social links: CMS → Site Identity.
  const { brand, header, contact, social, text: siteText, display, liveChatId } = useSiteInfo();
  const show = display.header;
  const showAskAi = show.askAi && !!header.askAiLabel && !!header.askAiHref;
  const showCta = show.cta && !!header.ctaLabel && !!header.ctaHref;
  const productsText = React.useMemo(() => resolveProductsText(siteText), [siteText]);
  const mobileContactLinks = React.useMemo(() => (show.contactTiles ? mobileContactLinksFor(header, contact.whatsappHref, liveChatId) : []), [header, contact.whatsappHref, liveChatId, show.contactTiles]);
  const [activeMenu, setActiveMenu] = React.useState<string | null>(null);
  const [openMobileSection, setOpenMobileSection] = React.useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount flag to avoid next-themes SSR/client icon mismatch
    setMounted(true);
  }, []);
  const isDark = mounted && theme === "dark";

  // The header menu — CMS → Navigation. Desktop and mobile menus share one source.
  const navigation = React.useMemo(
    () =>
      cmsNavigation.map((top) => ({
        name: top.name,
        href: top.href,
        featured: top.featured,
        items: top.items.map((i) => ({ name: i.name, href: i.href, description: i.description ?? "", icon: resolveIcon(i.iconKey) })),
      })),
    [cmsNavigation]
  );
  const mobileNavigation = React.useMemo(
    () =>
      cmsNavigation.map((top) => ({
        name: top.name,
        href: top.href,
        icon: resolveIcon(top.iconKey),
        items: top.items.map((i) => ({ name: i.name, href: i.href, icon: resolveIcon(i.iconKey) })),
      })),
    [cmsNavigation]
  );

  const logoLink = (
    <Link href="/" className="-m-1.5 p-1.5 flex items-center gap-2.5 group">
      <SiteLogo logoUrl={brand.logoUrl} logoDarkUrl={brand.logoDarkUrl} className="w-9 h-9 shrink-0 transition-transform duration-300 group-hover:scale-105" />
      <span className="flex flex-col leading-none">
        <span className="font-extrabold text-2xl tracking-tight">
          <span className="text-foreground">{brand.namePrimary}</span><span className="text-primary">{brand.nameAccent}</span>
        </span>
        {brand.subtitle && (
          <span className="mt-0.5 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.15em] text-foreground/80">
            {brand.subtitle}
          </span>
        )}
      </span>
    </Link>
  );

  const mobileControls = (
        <div className={`${menuOnly ? "flex" : "flex xl:hidden"} gap-4 items-center ml-auto`}>
          {show.themeToggle && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="p-2.5 rounded-full hover:bg-muted/80 backdrop-blur-sm transition-all"
          >
            {isDark ? <Sun className="w-5 h-5 text-foreground" /> : <Moon className="w-5 h-5 text-foreground" />}
          </button>
          )}
          <button
            type="button"
            aria-label="Open main menu"
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-foreground"
            onClick={() => {
              const activeSection = mobileNavigation.find(
                (section) => pathname === section.href || pathname?.startsWith(section.href + "/")
              );
              setOpenMobileSection(activeSection ? activeSection.name : null);
              setMobileMenuOpen(true);
            }}
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

  );

  const navItems = (
          <div className={`flex items-center gap-x-0.5 h-full ${menuStyle === "tiles" ? "" : "relative"}`}>
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
              // A menu item with nothing under it is a plain link: no arrow, no drop-down.
              const hasMenu = item.items.length > 0;
              return (
              <div
                key={item.name}
                // The tile bar spans the whole header, so it positions against the header, not against this one item.
                className={`py-2 ${menuStyle === "tiles" ? "" : "relative"}`}
                onMouseEnter={() => setActiveMenu(item.name)}
                onMouseLeave={() => setActiveMenu(null)}
              >
                <Link
                  href={item.href}
                  className={`relative flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-2 text-sm font-semibold transition-colors duration-200 xl:px-2.5 ${isActive || activeMenu === item.name ? "text-primary" : "text-foreground hover:text-primary hover:bg-muted/40"
                    }`}
                >
                  {activeMenu === item.name && (
                    <motion.span
                      layoutId="nav-hover-pill"
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                      className="absolute inset-0 -z-10 rounded-full bg-muted/60"
                    />
                  )}
                  {item.name}
                  {hasMenu && <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${activeMenu === item.name ? "rotate-180" : ""}`} />}
                </Link>

                <AnimatePresence>
                  {hasMenu && activeMenu === item.name && menuStyle !== "default" && <NavDropdown style={menuStyle} nav={item} />}
                  {hasMenu && activeMenu === item.name && menuStyle === "default" && (
                    <motion.div
                      initial={{ opacity: 0, y: 15, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.98 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="absolute left-1/2 z-50 mt-4 flex w-screen max-w-5xl -translate-x-1/2 px-4"
                    >
                      <div className="relative w-full flex-auto">
                        <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-primary/20 via-primary/0 to-secondary/20 blur-2xl pointer-events-none" />

                        <div className="relative w-full flex-auto overflow-hidden rounded-3xl bg-background/95 dark:bg-muted/20 backdrop-blur-2xl shadow-2xl ring-1 ring-border border border-border/50">
                          <div className="h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
                          <div className="grid grid-cols-5 p-2">
                            <FeaturedCard
                              item={item}
                              featuredLabel={header.featuredLabel}
                              cta={isProductsHref(item.href) ? { label: productsText["products.menu.cta"], href: SIGNUP_PATH, viewAllLabel: productsText["products.menu.viewAll"] } : undefined}
                            />
                            {/* A long list (Products has one entry per product) scrolls inside the card instead of running off short screens; shorter menus are unaffected. */}
                            <div className={`col-span-3 p-5 grid grid-cols-2 gap-x-6 gap-y-2.5 ${item.items.length > 10 ? "max-h-[calc(100vh-9rem)] overflow-y-auto overscroll-contain" : ""}`}>
                              {item.items.map((subItem) => (
                                <Link
                                  key={subItem.name}
                                  href={subItem.href}
                                  className="group relative flex items-start gap-3.5 rounded-xl p-2.5 hover:bg-muted/50 transition-colors"
                                >
                                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-border/50 group-hover:from-primary group-hover:to-brand-accent group-hover:border-primary group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                                    <subItem.icon className="h-4.5 w-4.5 text-muted-foreground group-hover:text-white transition-colors duration-300" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-foreground text-sm mb-0.5 group-hover:text-primary transition-colors whitespace-nowrap">
                                      {subItem.name}
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-1">{subItem.description}</p>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              );
            })}

            {showAskAi && (
            <Link
              href={header.askAiHref}
              className={`relative ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-semibold transition-colors duration-200 ${
                pathname === header.askAiHref
                  ? "text-primary"
                  : "text-foreground hover:text-primary hover:bg-muted/40"
              }`}
            >
              <Bot className="h-4 w-4 text-primary" />
              {header.askAiLabel}
            </Link>
            )}
          </div>

  );

  const actions = (
          <div className="flex items-center gap-3">
            {show.social && social.length > 0 && (
              <div className="flex items-center gap-1.5">
                {social.map((link) => {
                  const Icon = socialIconFor(link.name);
                  return (
                    <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" className="flex size-9 items-center justify-center rounded-full border border-border/50 bg-muted/30 text-muted-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground">
                      <span className="sr-only">{link.name}</span>
                      <Icon className="h-4 w-4" />
                    </a>
                  );
                })}
              </div>
            )}
            {show.authLinks && <PortalAuthLink variant="desktop" menuStyle={menuStyle} />}
            {show.themeToggle && (
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="p-2.5 rounded-full bg-muted/30 hover:bg-muted/80 backdrop-blur-sm transition-all border border-border/50"
            >
              {isDark ? <Sun className="w-4 h-4 text-foreground" /> : <Moon className="w-4 h-4 text-foreground" />}
            </button>
            )}
            {showCta && (
            <Link
              href={header.ctaHref}
              className="group relative inline-flex flex-none items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-all hover:scale-105 active:scale-95"
            >
              <span className="relative z-10 flex items-center gap-2 whitespace-nowrap">
                {header.ctaLabel} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
            )}
          </div>
  );

  const centered = variant === "centered";
  const floating = variant === "floating";
  const headerClass = floating
    ? "fixed inset-x-3 top-[calc(var(--offer-strip-h,0px)+12px)] z-50 mx-auto h-[64px] max-w-7xl rounded-full border border-border/60 bg-background/85 shadow-lg shadow-black/5 backdrop-blur-xl dark:bg-muted/30"
    : "fixed inset-x-0 top-[var(--offer-strip-h,0px)] z-50 h-[88px] xl:h-[var(--site-header-h,88px)] bg-background/80 dark:bg-muted/20 backdrop-blur-xl border-b border-border/50";

  return (
    <>
    <header className={headerClass}>
      {centered ? (
        <nav className="mx-auto flex h-full max-w-7xl flex-col px-6 lg:px-8" aria-label="Global">
          <div className="flex h-[88px] shrink-0 items-center justify-between xl:h-[76px]">
            <div className="flex shrink-0">{logoLink}</div>
            {mobileControls}
            <div className="ml-auto hidden items-center justify-end gap-3 xl:flex">{actions}</div>
          </div>
          <div className={`hidden h-[52px] flex-1 items-center justify-center border-t border-border/40 xl:flex ${menuStyle === "tiles" ? "" : "relative"}`}>{navItems}</div>
        </nav>
      ) : (
        <nav className={`mx-auto flex h-full max-w-7xl items-center justify-between ${floating ? "px-6" : "px-6 lg:px-8"}`} aria-label="Global">
          <div className="flex shrink-0">{logoLink}</div>
          {mobileControls}
          <div className={`${menuOnly ? "hidden" : "hidden xl:flex"} xl:items-center xl:gap-x-3 ml-auto h-full ${menuStyle === "tiles" ? "" : "relative"}`}>
            {navItems}
            {actions}
          </div>
        </nav>
      )}
    </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[100] ${menuOnly ? "" : "xl:hidden"}`}
          >
            <div className="fixed inset-0 bg-background/80 backdrop-blur-md" onClick={() => setMobileMenuOpen(false)} />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="fixed inset-y-0 right-0 z-[100] w-full overflow-y-auto bg-background dark:bg-muted/20 backdrop-blur-2xl px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-border/50"
            >
              <div className="flex items-center justify-between">
                <Link href="/" className="-m-1.5 p-1.5 flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
                  <SiteLogo logoUrl={brand.logoUrl} logoDarkUrl={brand.logoDarkUrl} className="w-8 h-8 shrink-0" />
                  <span className="flex flex-col leading-none">
                    <span className="font-extrabold text-xl tracking-tight">
                      <span className="text-foreground">{brand.namePrimary}</span><span className="text-primary">{brand.nameAccent}</span>
                    </span>
                    {brand.subtitle && (
                      <span className="mt-0.5 whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.13em] text-foreground/80">
                        {brand.subtitle}
                      </span>
                    )}
                  </span>
                </Link>
                <button
                  type="button"
                  className="-m-2.5 rounded-full p-2.5 text-muted-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="sr-only">Close menu</span>
                  <X className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-8 flow-root">
                <div className="border-b border-border/50 pb-2">
                  {mobileNavigation.map((section) => {
                    const isSectionActive = pathname === section.href || pathname?.startsWith(section.href + "/");
                    const isOpen = openMobileSection === section.name;
                    // A menu item with nothing under it is a plain link, not an accordion.
                    if (section.items.length === 0) {
                      return (
                        <div key={section.name} className="border-t border-border/50 first:border-t-0">
                          <Link href={section.href} onClick={() => setMobileMenuOpen(false)} className="flex w-full items-center gap-3 py-4">
                            <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg border transition-colors ${isSectionActive ? "border-primary/30 bg-primary/5 text-primary" : "border-border/50 text-muted-foreground"}`}>
                              <section.icon className="h-4 w-4" />
                            </span>
                            <span className={`text-base font-bold transition-colors ${isSectionActive ? "text-primary" : "text-foreground"}`}>{section.name}</span>
                          </Link>
                        </div>
                      );
                    }
                    return (
                      <div key={section.name} className="border-t border-border/50 first:border-t-0">
                        <button
                          type="button"
                          onClick={() => setOpenMobileSection(isOpen ? null : section.name)}
                          className="flex w-full items-center justify-between gap-3 py-4"
                          aria-expanded={isOpen}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg border transition-colors ${
                                isSectionActive ? "border-primary/30 bg-primary/5 text-primary" : "border-border/50 text-muted-foreground"
                              }`}
                            >
                              <section.icon className="h-4 w-4" />
                            </span>
                            <span className={`text-base font-bold transition-colors ${isSectionActive ? "text-primary" : "text-foreground"}`}>
                              {section.name}
                            </span>
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 flex-none text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180 text-primary" : ""}`}
                          />
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              <div className="pb-4 pl-[3.25rem] space-y-1">
                                {section.items.map((item) => {
                                  const isItemActive = pathname === item.href;
                                  return (
                                    <Link
                                      key={item.name}
                                      href={item.href}
                                      onClick={() => setMobileMenuOpen(false)}
                                      className={`flex items-center gap-3 rounded-r-lg border-l-2 py-2.5 pl-3 pr-3 text-sm transition-colors ${
                                        isItemActive
                                          ? "border-primary bg-primary/5 font-semibold text-primary"
                                          : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-primary"
                                      }`}
                                    >
                                      <item.icon className="h-4 w-4 flex-none" />
                                      {item.name}
                                    </Link>
                                  );
                                })}
                                <Link
                                  href={section.href}
                                  onClick={() => setMobileMenuOpen(false)}
                                  className="flex items-center gap-1.5 py-2 mt-1 pt-2 border-t border-border/30 text-sm font-semibold text-primary"
                                >
                                  View All {section.name}
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}

                  {showAskAi && (
                  <Link
                    href={header.askAiHref}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 border-t border-border/50 py-4 ${
                      pathname === header.askAiHref ? "text-primary" : "text-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg border transition-colors ${
                        pathname === header.askAiHref
                          ? "border-primary/30 bg-primary/5 text-primary"
                          : "border-border/50 text-muted-foreground"
                      }`}
                    >
                      <Bot className="h-4 w-4" />
                    </span>
                    <span className="text-base font-bold">{header.askAiLabel}</span>
                  </Link>
                  )}
                </div>

                {mobileContactLinks.length > 0 && (
                <div className="border-b border-border/50 py-4">
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${mobileContactLinks.length}, minmax(0, 1fr))` }}>
                    {mobileContactLinks.map((link) => {
                      const tileContent = (
                        <>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <link.icon className="h-4 w-4" />
                          </span>
                          <span className="text-xs font-medium leading-tight text-muted-foreground">{link.name}</span>
                        </>
                      );
                      const tileClassName = "flex flex-col items-center gap-2 rounded-xl px-2 py-3 text-center transition-colors hover:bg-muted/50";

                      if (link.type === "action") {
                        return (
                          <button
                            key={link.name}
                            type="button"
                            onClick={() => {
                              loadAndToggleTawk(liveChatId);
                              setMobileMenuOpen(false);
                            }}
                            className={tileClassName}
                          >
                            {tileContent}
                          </button>
                        );
                      }

                      if (link.type === "external") {
                        return (
                          <a
                            key={link.name}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setMobileMenuOpen(false)}
                            className={tileClassName}
                          >
                            {tileContent}
                          </a>
                        );
                      }

                      return (
                        <Link
                          key={link.name}
                          href={link.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={tileClassName}
                        >
                          {tileContent}
                        </Link>
                      );
                    })}
                  </div>
                </div>
                )}

                <div className="space-y-5 pt-6">
                  <div className="grid grid-cols-1 gap-3">
                    {show.authLinks && <PortalAuthLink variant="mobile" onNavigate={() => setMobileMenuOpen(false)} />}
                    {showCta && <Link
                      href={header.ctaHref}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3.5 text-base font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
                    >
                      {header.ctaLabel} <ArrowRight className="w-5 h-5" />
                    </Link>}
                  </div>

                  <div className="flex flex-col gap-3">
                    {contact.email && <a href={`mailto:${contact.email}`} className="group flex items-center gap-3">
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary">
                        <Mail className="h-4 w-4 text-primary transition-colors group-hover:text-primary-foreground" />
                      </span>
                      <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                        {contact.email}
                      </span>
                    </a>}
                    {contact.phoneHref && contact.phoneDisplay && <a href={contact.phoneHref} className="group flex items-center gap-3">
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary">
                        <Phone className="h-4 w-4 text-primary transition-colors group-hover:text-primary-foreground" />
                      </span>
                      <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                        {contact.phoneDisplay}
                      </span>
                    </a>}
                  </div>

                  {social.length > 0 && <div className="pt-1">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{header.followLabel}</p>
                    <div className="flex items-center gap-3">
                      {social.map((link) => {
                        const Icon = socialIconFor(link.name);
                        return (
                        <a
                          key={link.name}
                          href={link.href}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-muted/50 text-muted-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                        >
                          <span className="sr-only">{link.name}</span>
                          <Icon className="h-4 w-4" />
                        </a>
                        );
                      })}
                    </div>
                  </div>}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
