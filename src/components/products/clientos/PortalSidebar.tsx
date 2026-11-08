"use client";

import Link from "next/link";
import React from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FileText,
  CalendarClock,
  FolderOpen,
  Bell,
  CircleUser,
  GraduationCap,
  FolderKanban,
  ClipboardList,
  CalendarCheck,
  Award,
  Wallet,
  Flag,
  ReceiptText,
  Route,
  MessagesSquare,
  Coins,
  Gift,
  Flame,
  Trophy,
  ListChecks,
  FileCheck2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { PORTAL_NAV, PORTAL_ROLE_META, type PortalRole } from "@/lib/portal-roles";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  FileText,
  CalendarClock,
  FolderOpen,
  Bell,
  CircleUser,
  GraduationCap,
  FolderKanban,
  ClipboardList,
  CalendarCheck,
  Award,
  Wallet,
  Flag,
  ReceiptText,
  Route,
  MessagesSquare,
  Coins,
  Gift,
  Flame,
  Trophy,
  ListChecks,
  FileCheck2,
};

function NavLink({
  href,
  label,
  icon,
  exact,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const Icon = ICONS[icon] ?? LayoutDashboard;
  const active = exact ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);

  const inner = (
    <>
      {active && (
        <motion.span
          layoutId="portal-nav-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon className="relative size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="relative truncate">{label}</span>}
    </>
  );

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
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

/** Same section heading the LMS / TMS / PMS sidebars use, so every product groups its navigation the same way. */
function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed?: boolean }) {
  if (collapsed) return <div className="mt-3 mb-0.5 border-t border-border/50" />;
  return <div className="mt-3 mb-0.5 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>;
}

/** The whole sidebar is `PORTAL_NAV[role]`, rendered under its category headings — nothing shared, nothing hidden. */
export default function PortalSidebar({
  role,
  collapsed = false,
  onNavigate,
}: {
  role: PortalRole;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const items = PORTAL_NAV[role];

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      {!collapsed && (
        <p className="mb-1 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {PORTAL_ROLE_META[role].portalName}
        </p>
      )}
      {items.map((item, i) => (
        <React.Fragment key={item.href}>
          {item.group && item.group !== items[i - 1]?.group && <SectionLabel collapsed={collapsed}>{item.group}</SectionLabel>}
          <NavLink {...item} collapsed={collapsed} onNavigate={onNavigate} />
        </React.Fragment>
      ))}
    </nav>
  );
}
