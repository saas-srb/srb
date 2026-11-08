"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  ShoppingCart,
  GraduationCap,
  MessagesSquare,
  LayoutGrid,
  Landmark,
  ShieldCheck,
  BarChart3,
  KeyRound,
  Globe,
  Globe2,
  ExternalLink,
  BookText,
  SearchCheck,
  Vault,
  Bot,
  Megaphone,
  FileCheck2,
  PanelsTopLeft,
  Building2,
  CreditCard,
  ReceiptText,
  Gauge,
  Palette,
  Wallet,
  Plug,
  Zap,
  FileUp,
  History,
  Lock,
  Bell,
  FileText,
  LifeBuoy,
  Smartphone,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { NavIcon, NavSection } from "@/lib/products/commandos/nav";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  help: LifeBuoy,
  dashboard: LayoutDashboard,
  users: Users,
  projects: FolderKanban,
  cart: ShoppingCart,
  training: GraduationCap,
  finance: Landmark,
  book: BookText,
  search: SearchCheck,
  vault: Vault,
  bot: Bot,
  megaphone: Megaphone,
  mail: Mail,
  test: FileCheck2,
  chat: MessagesSquare,
  grid: LayoutGrid,
  website: PanelsTopLeft,
  shield: ShieldCheck,
  chart: BarChart3,
  globe: Globe,
  building: Building2,
  card: CreditCard,
  receipt: ReceiptText,
  gauge: Gauge,
  palette: Palette,
  smartphone: Smartphone,
  bank: Wallet,
  plug: Plug,
  zap: Zap,
  upload: FileUp,
  history: History,
  lock: Lock,
  bell: Bell,
  key: KeyRound,
  file: FileText,
  platform: Globe2,
};


function NavLink({
  href,
  label,
  icon: Icon,
  exact = false,
  collapsed = false,
  external = false,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  collapsed?: boolean;
  external?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname?.startsWith(href);

  const inner = (
    <>
      {active && (
        <motion.span
          layoutId="hub-nav-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon className="relative size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="relative truncate flex-1">{label}</span>}
      {!collapsed && external && <ExternalLink className="relative size-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity" />}
    </>
  );

  const link = (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "text-primary font-semibold" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
      )}
    >
      {inner}
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

function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}

/**
 * The Workspace sidebar. It renders exactly the sections and items the server
 * resolved for this user (`resolveWorkspaceNav`) — no access rule lives here.
 * Sections marked `sidebar: false` (the products: they are opened from the
 * Staff Hub tiles) are left out of the desktop, collapsed and mobile sidebars.
 */
export default function HubSidebar({
  nav,
  onNavigate,
  collapsed = false,
}: {
  nav: NavSection[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Workspace" className="flex h-full flex-col gap-1 p-3 overflow-y-auto">
      {nav.filter((section) => section.sidebar).map((section) => {
        const filteredItems = section.items.filter(
          (item) =>
            item.key !== "company.payments" &&
            item.label !== "Payment account"
        );
        const links = (
          <>
            {filteredItems.map((item, i) => (
              <div key={item.key} className="contents">
                {item.group && item.group !== filteredItems[i - 1]?.group && (
                  // A category is a heading in its own right — same look as a section heading, not clickable, not collapsible.
                  collapsed ? <div className="mt-4 mb-1 border-t border-border/50" /> : (
                    <div className="mt-4 mb-1 flex items-center gap-1 px-3">
                      <span className="flex-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{item.group}</span>
                    </div>
                  )
                )}
                <NavLink
                  href={item.href}
                  label={item.label}
                  icon={ICONS[item.icon]}
                  exact={item.href === "/commandos" || item.href === "/commandos/settings/billing"}
                  external={item.external}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              </div>
            ))}
          </>
        );
        // Sections whose items carry categories show those as the headings instead of one umbrella heading.
        if (!section.label || filteredItems.some((item) => item.group)) return <div key={section.key} className="contents">{links}</div>;

        // The icon-only sidebar has no room for a section header: show a divider and the open sections' icons.
        if (collapsed) {
          return (
            <div key={section.key} className="contents" data-nav-section={section.key}>
              <div className="mt-4 mb-1 border-t border-border/50" />
              {links}
            </div>
          );
        }
        return (
          <div key={section.key} className="contents" data-nav-section={section.key}>
            <div className="mt-4 mb-1 flex items-center gap-1 px-3">
              <span className="flex-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{section.label}</span>
            </div>
            {links}
          </div>
        );
      })}
    </nav>
  );
}
