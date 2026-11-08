"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Files, Image as ImageIcon, Menu as MenuIcon, PanelBottom, ClipboardList, Palette, BadgeInfo, Layers, Newspaper, Briefcase, Users, Boxes, SearchCheck, Paintbrush, BellRing,
  Gift, TicketPercent, Coins, Sparkles, BookText,
  Share2, Megaphone, SlidersVertical, WalletCards,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/** Which optional sections this viewer may see (and small counts) — computed on the server from the real permission model. */
export interface CmsNavFlags {
  settings: boolean;
  audit: boolean;
  /** Pages with unpublished changes — shown as a count on "Pages". */
  pendingPages?: number;
  /** Key of the active theme, for the Appearance → Customize shortcut. */
  activeTheme?: string;
}

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; count?: number };

function NavLink({
  href,
  label,
  icon: Icon,
  exact = false,
  count,
  collapsed = false,
  onNavigate,
}: NavItem & {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  // Links with a query (e.g. /sitecraft-ai/pages?area=services) are active only for that exact filter;
  // their bare path (/sitecraft-ai/pages) is active only without it.
  const [base, query] = href.split("?");
  const area = search?.get("area") ?? null;
  const wantArea = query ? new URLSearchParams(query).get("area") : null;
  const pathMatch = exact || query ? pathname === base : pathname === base || pathname?.startsWith(base + "/");
  // A filtered link (Services) is active only on its filter; "Pages" is active everywhere else under /sitecraft-ai/pages.
  const active = pathMatch && (query ? area === wantArea : !(pathname === base && area));

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
      )}
    >
      {active && (
        <motion.span
          layoutId="cms-nav-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon className="relative size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="relative truncate">{label}</span>}
      {!collapsed && count ? (
        <span className="relative ml-auto rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400" title={`${count} with unpublished changes`}>
          {count}
        </span>
      ) : null}
      {collapsed && count ? <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-amber-500" /> : null}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed?: boolean }) {
  if (collapsed) return <div className="mt-4 mb-1 border-t border-border/50" />;
  return <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>;
}

export default function CmsSidebar({ flags, onNavigate, collapsed = false }: { flags: CmsNavFlags; onNavigate?: () => void; collapsed?: boolean }) {
  const groups: { label: string | null; items: NavItem[] }[] = [
    { label: null, items: [{ href: "/sitecraft-ai", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
    {
      label: "Content",
      items: [
        { href: "/sitecraft-ai/pages", label: "Pages", icon: Files, count: flags.pendingPages },
        { href: "/sitecraft-ai/pages?area=services", label: "Services", icon: Layers },
        { href: "/sitecraft-ai/collections/blog", label: "Blog Posts", icon: Newspaper },
        { href: "/sitecraft-ai/collections/jobs", label: "Careers", icon: Briefcase },
        { href: "/sitecraft-ai/collections/engagement", label: "Hiring Models", icon: Users },
        { href: "/sitecraft-ai/collections/products", label: "Products", icon: Boxes },
      ],
    },
    {
      label: "Assets",
      items: [
        { href: "/sitecraft-ai/media", label: "Media Library", icon: ImageIcon },
        { href: "/sitecraft-ai/forms", label: "Forms", icon: ClipboardList },
      ],
    },
    {
      label: "Appearance",
      items: [
        { href: "/sitecraft-ai/ai-website", label: "AI Website", icon: Sparkles },
        { href: "/sitecraft-ai/theme", label: "Themes", icon: Palette },
        { href: `/sitecraft-ai/customize/${flags.activeTheme ?? "default"}`, label: "Customize", icon: Paintbrush },
        { href: "/sitecraft-ai/navigation", label: "Menus", icon: MenuIcon },
        { href: "/sitecraft-ai/footer", label: "Footer", icon: PanelBottom },
        { href: "/sitecraft-ai/site-identity", label: "Site Identity", icon: BadgeInfo },
      ],
    },
    {
      label: "Festival Offers",
      items: [
        { href: "/sitecraft-ai/offers", label: "Campaigns", icon: Gift },
        { href: "/sitecraft-ai/offers/coupons", label: "Coupons", icon: TicketPercent },
        { href: "/sitecraft-ai/offers/claims", label: "Claims", icon: ClipboardList },
        { href: "/sitecraft-ai/offers/subscribers", label: "Subscribers", icon: BellRing },
      ],
    },
    {
      label: "Wallet & Credits",
      items: [
        { href: "/sitecraft-ai/wallet", label: "Overview", icon: Coins, exact: true },
        { href: "/sitecraft-ai/wallet/rules", label: "Reward Rules", icon: Sparkles },
        { href: "/sitecraft-ai/wallet/referrals", label: "Referrals", icon: Share2 },
        { href: "/sitecraft-ai/wallet/campaigns", label: "Referral Campaigns", icon: Megaphone },
        { href: "/sitecraft-ai/wallet/usage-rules", label: "Usage Rules", icon: SlidersVertical },
        { href: "/sitecraft-ai/wallet/wallets", label: "Balances", icon: WalletCards },
        { href: "/sitecraft-ai/wallet/ledger", label: "Ledger", icon: BookText },
      ],
    },
    {
      label: "Search",
      items: [{ href: "/sitecraft-ai/seo", label: "SEO Overview", icon: SearchCheck }],
    },
  ];

  return (
    <nav className="flex h-full flex-col gap-0.5 p-3" aria-label="CMS">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g, i) => (
          <div key={g.label ?? i} className="flex flex-col gap-0.5">
            {g.label && <SectionLabel collapsed={collapsed}>{g.label}</SectionLabel>}
            {g.items.map((item) => (
              <NavLink key={item.href} {...item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
    </nav>
  );
}
