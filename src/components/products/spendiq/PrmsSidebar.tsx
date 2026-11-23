"use client";

import NavGroup from "@/components/products/common/NavGroup";
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
import type { AccessSubject } from "@/lib/access/can";
import { prmsCan } from "@/lib/prms-access";

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

export default function PrmsSidebar({
  roles,
  permissionOverrides,
  subject,
  onNavigate,
  collapsed = false,
}: {
  roles: PrmsRole[];
  permissionOverrides?: Record<string, boolean>;
  subject: AccessSubject;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const nav = (props: {
    locked?: boolean;
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    exact?: boolean;
  }) => (props.locked ? null : <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />);

  void roles; void permissionOverrides;

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ href: "/spendiq", label: "Dashboard", icon: LayoutDashboard, exact: true, locked: !prmsCan({ subject }, "dashboard.view") })}

      <NavGroup collapsed={collapsed} label="Procurement">
        {nav({ href: "/spendiq/requisitions", label: "Purchase Requests", icon: ClipboardList, locked: !prmsCan({ subject }, "requisitions.view") })}
        {nav({ href: "/spendiq/purchase-orders", label: "Purchase Orders", icon: FileText, locked: !prmsCan({ subject }, "purchaseorders.view") })}
        {nav({ href: "/spendiq/expenses", label: "Expenses", icon: Receipt, locked: !prmsCan({ subject }, "expenses.view") })}
        {nav({ href: "/spendiq/vendors", label: "Vendors", icon: Building2, locked: !prmsCan({ subject }, "vendors.view") })}
      </NavGroup>
      <NavGroup collapsed={collapsed} label="Company Assets">
        {nav({ href: "/spendiq/assets", label: "Hardware & Assets", icon: Boxes, locked: !prmsCan({ subject }, "assets.view") })}
        {nav({ href: "/spendiq/subscriptions", label: "Subscriptions", icon: Cloud, locked: !prmsCan({ subject }, "subscriptions.view") })}
      </NavGroup>
      <NavGroup collapsed={collapsed} label="Governance">
        {nav({ href: "/spendiq/analytics", label: "Analytics", icon: BarChart3, locked: !prmsCan({ subject }, "analytics.view") })}
      </NavGroup>
    </nav>
  );
}
