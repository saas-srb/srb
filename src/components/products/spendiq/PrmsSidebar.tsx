"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FileText,
  Building2,
  Receipt,
  Boxes,
  Cloud,
  ClipboardList,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { PrmsRole } from "@/lib/prms-roles";
import { hasPrmsStaffRole, canManageSettings, canViewAuditLog } from "@/lib/prms-roles";

function NavLink({
  href,
  label,
  icon: Icon,
  exact = false,
  collapsed = false,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname?.startsWith(href);

  const inner = (
    <>
      {active && (
        <motion.span
          layoutId="prms-nav-active"
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
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed?: boolean }) {
  if (collapsed) return <div className="mt-4 mb-1 border-t border-border/50" />;
  return (
    <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  );
}

export default function PrmsSidebar({
  roles,
  permissionOverrides,
  onNavigate,
  collapsed = false,
}: {
  roles: PrmsRole[];
  permissionOverrides?: Record<string, boolean>;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const nav = (props: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    exact?: boolean;
  }) => <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />;

  const isStaff = hasPrmsStaffRole(roles);
  const roleCtx = { roles, permissionOverrides };

  // Employee self-service
  if (!isStaff) {
    return (
      <nav className="flex h-full flex-col gap-1 p-3">
        {nav({ href: "/spendiq/me", label: "My Dashboard", icon: LayoutDashboard, exact: true })}
        {nav({ href: "/spendiq/me/requisitions", label: "My Requests", icon: ClipboardList })}
        {nav({ href: "/spendiq/me/expenses", label: "My Expenses", icon: Receipt })}
      </nav>
    );
  }

  return (
    <nav className="flex h-full flex-col gap-1 p-3">

      {/* Overview */}
      {nav({ href: "/spendiq", label: "Dashboard", icon: LayoutDashboard, exact: true })}

      {/* ── Procurement ── */}
      <SectionLabel collapsed={collapsed}>Procurement</SectionLabel>
      {nav({ href: "/spendiq/requisitions", label: "Purchase Requests", icon: ClipboardList })}
      {nav({ href: "/spendiq/purchase-orders", label: "Purchase Orders", icon: FileText })}
      {nav({ href: "/spendiq/expenses", label: "Expenses", icon: Receipt })}
      {nav({ href: "/spendiq/vendors", label: "Vendors", icon: Building2 })}

      {/* ── Company Assets ── */}
      <SectionLabel collapsed={collapsed}>Company Assets</SectionLabel>
      {nav({ href: "/spendiq/assets", label: "Hardware & Assets", icon: Boxes })}
      {nav({ href: "/spendiq/subscriptions", label: "Subscriptions", icon: Cloud })}

      <SectionLabel collapsed={collapsed}>Governance</SectionLabel>
      {nav({ href: "/spendiq/analytics", label: "Analytics", icon: BarChart3 })}
    </nav>
  );
}
