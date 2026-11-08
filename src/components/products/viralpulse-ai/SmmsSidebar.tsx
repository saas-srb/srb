"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, Megaphone, Share2, ImagePlus, BarChart3, Settings, Clapperboard, Images, Palette, Wand2, BookOpen, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { activeItem, badgeFor, badgeText, groupedNav, visibleNav, type BadgeView, type NavBadges, type NavIcon, type NavItem, type SmmsNavFlags } from "@/lib/products/viralpulse-ai/nav";

export type { SmmsNavFlags } from "@/lib/products/viralpulse-ai/nav";

const ICONS: Record<NavIcon, React.ReactNode> = {
  dashboard: <LayoutDashboard className="size-4" />,
  campaigns: <Megaphone className="size-4" />,
  posts: <Share2 className="size-4" />,
  image: <ImagePlus className="size-4" />,
  ugc: <Clapperboard className="size-4" />,
  generate: <Wand2 className="size-4" />,
  library: <Images className="size-4" />,
  brand: <Palette className="size-4" />,
  analytics: <BarChart3 className="size-4" />,
  settings: <Settings className="size-4" />,
  brochure: <BookOpen className="size-4" />,
  vcard: <CreditCard className="size-4" />,
};

const TONE: Record<BadgeView["tone"], string> = {
  danger: "bg-rose-600 text-white",
  warn: "bg-amber-500 text-white",
  info: "bg-primary text-primary-foreground",
};

function Badge({ badge, collapsed }: { badge: BadgeView; collapsed: boolean }) {
  return (
    <span
      className={cn("relative flex shrink-0 items-center justify-center rounded-full text-[10px] leading-none font-bold tabular-nums", TONE[badge.tone], collapsed ? "absolute top-0.5 right-1.5 min-w-4 px-1 py-0.5" : "ml-auto min-w-5 px-1.5 py-1")}
      aria-label={badge.label}
      title={badge.label}
    >
      {badgeText(badge.count)}
    </span>
  );
}

function NavLink({ item, active, badge, collapsed, onNavigate }: { item: NavItem; active: boolean; badge: BadgeView | null; collapsed: boolean; onNavigate?: () => void }) {
  const label = badge ? `${item.label} (${badge.label})` : item.label;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
      )}
    >
      {active && <motion.span layoutId="smms-nav-active" className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
      <span className="relative flex shrink-0 items-center transition-transform duration-200 group-hover:scale-110">{ICONS[item.icon]}</span>
      {!collapsed && <span className="relative truncate">{item.label}</span>}
      {badge && <Badge badge={badge} collapsed={collapsed} />}
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

/** One sidebar for desktop, collapsed and mobile: the items, their order and their active matching come from `lib/.../nav.ts`. */
function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed?: boolean }) {
  if (collapsed) return <div className="mt-4 mb-1 border-t border-border/50" />;
  return <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>;
}

/** One sidebar for desktop, collapsed and mobile: sections, items, order and active matching come from `lib/.../nav.ts`. */
export default function SmmsSidebar({ flags, badges, onNavigate, collapsed = false }: { flags: SmmsNavFlags; badges?: NavBadges; onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const current = activeItem(visibleNav(flags), pathname);
  return (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="ViralPulse">
      {groupedNav(flags).map((g) => (
        <div key={g.key} className="flex flex-col gap-1">
          {g.label && <SectionLabel collapsed={collapsed}>{g.label}</SectionLabel>}
          {g.items.map((item) => (
            <NavLink key={item.key} item={item} active={current?.key === item.key} badge={badgeFor(item, badges)} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}
