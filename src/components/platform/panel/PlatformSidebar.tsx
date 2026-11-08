"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Building2,
  UserPlus,
  Globe,
  Package,
  Calculator,
  Repeat,
  FileText,
  TicketPercent,
  Puzzle,
  CreditCard,
  Receipt,
  LineChart,
  Gauge,
  ShieldCheck,
  Plug,
  ScrollText,
  Settings2,
  LifeBuoy,
  LayoutGrid,
  BookOpen,
  SlidersHorizontal,
  Wrench,
  Sparkles,
  MessageSquareText,
  Scale,
  AlertTriangle,
  Clock,
  BellRing,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/** Live counts shown as badges — computed on the server. */
export interface PlatformNavFlags {
  pendingApprovals: number;
  /** Unread notifications for the signed-in platform user (shown on the top-bar bell). */
  unreadNotifications?: number;
  /** Routes the signed-in user has no permission to view — left out of the menu. */
  hidden?: string[];
}

type Icon = React.ComponentType<{ className?: string }>;

/**
 * The Platform Console's map of every SaaS area. `planned` entries are part of
 * the product's scope but not built yet — they render greyed out (no dead
 * links), and become links as each one ships.
 */
const SECTIONS: { label: string; items: { href: string; label: string; icon: Icon; exact?: boolean; planned?: boolean; badge?: "pendingApprovals" }[] }[] = [
  { label: "", items: [{ href: "/console", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
  {
    label: "Tenants",
    items: [
      { href: "/console/companies", label: "Companies", icon: Building2 },
      { href: "/console/products", label: "Products", icon: LayoutGrid },
      { href: "/console/signups", label: "Sign-ups & approvals", icon: UserPlus, badge: "pendingApprovals" },
      { href: "/console/domains", label: "Domains & SSL", icon: Globe },
    ],
  },
  {
    label: "Billing",
    items: [
      { href: "/console/plans", label: "Plans & pricing", icon: Package },
      { href: "/console/costs", label: "Costs & pricing calculator", icon: Calculator },
      { href: "/console/subscriptions", label: "Subscriptions", icon: Repeat },
      { href: "/console/invoices", label: "SaaS invoices", icon: FileText },
      { href: "/console/coupons", label: "Coupons & discounts", icon: TicketPercent },
      { href: "/console/addons", label: "Add-ons", icon: Puzzle },
      { href: "/console/payments", label: "Payments & Razorpay", icon: CreditCard },
      { href: "/console/settings/billing", label: "Tax & invoicing", icon: Receipt },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/console/revenue", label: "Revenue & subscriptions", icon: LineChart },
      { href: "/console/usage", label: "Usage & limits", icon: Gauge },
      { href: "/console/ai-usage", label: "AI token history", icon: Sparkles },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/console/resolveiq", label: "Support requests", icon: LifeBuoy, exact: true },
      { href: "/console/resolveiq/help", label: "Help content", icon: BookOpen },
      { href: "/console/resolveiq/settings", label: "Support settings", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/console/users", label: "Platform users & roles", icon: ShieldCheck },
      { href: "/console/integrations", label: "Integrations", icon: Plug },
      { href: "/console/audit", label: "Audit log", icon: ScrollText },
      { href: "/console/settings", label: "Platform settings", icon: Settings2, exact: true },
      { href: "/console/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/console/notification-center", label: "Notification center", icon: BellRing },
      { href: "/console/documents", label: "Documents & PDFs", icon: FileText },
      { href: "/console/prompts", label: "AI prompts", icon: MessageSquareText },
      { href: "/console/legal", label: "Legal & compliance", icon: Scale },
      { href: "/console/payroll-rates", label: "Payroll rates", icon: Scale },
      { href: "/console/tax-rulebook", label: "Tax rulebook", icon: Scale },
      { href: "/console/stamp-rulebook", label: "Stamp rulebook", icon: Scale },
      { href: "/console/scheduled-jobs", label: "Cron jobs", icon: Clock },
      { href: "/console/incidents", label: "Incidents & status", icon: AlertTriangle },
      { href: "/commandos", label: "Workspace", icon: LayoutGrid, exact: true },
    ],
  },
];

function NavItem({
  href,
  label,
  icon: Icon,
  exact,
  planned,
  badge,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: Icon;
  exact?: boolean;
  planned?: boolean;
  badge?: number;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = !planned && (exact ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`));
  const base = cn("group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors", collapsed && "justify-center px-0");

  const body = (
    <>
      {active && (
        <motion.span layoutId="platform-nav-active" className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
      )}
      <Icon className="relative size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="relative truncate">{label}</span>}
      {!collapsed && planned && <span className="relative ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Soon</span>}
      {!collapsed && !planned && badge ? <span className="relative ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{badge}</span> : null}
    </>
  );

  const element = planned ? (
    <span aria-disabled="true" aria-label={collapsed ? `${label} (coming soon)` : undefined} className={cn(base, "cursor-default text-muted-foreground/60")}>
      {body}
    </span>
  ) : (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(base, active ? "text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary")}
    >
      {body}
    </Link>
  );

  if (!collapsed) return element;
  return (
    <Tooltip>
      <TooltipTrigger render={element} />
      <TooltipContent side="right">{planned ? `${label} — coming soon` : label}</TooltipContent>
    </Tooltip>
  );
}

export default function PlatformSidebar({ flags, onNavigate, collapsed = false }: { flags: PlatformNavFlags; onNavigate?: () => void; collapsed?: boolean }) {
  return (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Platform Console">
      {SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => !flags.hidden?.includes(item.href)) }))
        .filter((section) => section.items.length > 0)
        .map((section) => (
        <div key={section.label || "top"} className="flex flex-col gap-1">
          {section.label &&
            (collapsed ? (
              <div className="mt-4 mb-1 border-t border-border/50" />
            ) : (
              <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{section.label}</div>
            ))}
          {section.items.map((item) => (
            <NavItem key={item.href} {...item} badge={item.badge ? flags[item.badge] : undefined} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}
