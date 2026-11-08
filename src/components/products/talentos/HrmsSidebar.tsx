"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Building2,
  UserPlus,
  CalendarClock,
  CalendarDays,
  CalendarCheck,
  Wallet,
  Banknote,
  Landmark,
  ListChecks,
  FileText,
  UserRound,
  Network,
  BarChart3,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { HrmsRole } from "@/lib/hrms-roles";
import { canApproveLeave, canRunPayroll, hasStaffRole } from "@/lib/hrms-roles";

function NavLink({
  href,
  label,
  icon: Icon,
  exact = false,
  collapsed = false,
  disabled = false,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  collapsed?: boolean;
  disabled?: boolean;
  badge?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = !disabled && (exact ? pathname === href : pathname?.startsWith(href));

  const inner = (
    <>
      {active && (
        <motion.span
          layoutId="hrms-nav-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon className="relative size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="relative truncate">{label}</span>}
      {!collapsed && badge && (
        <span className="relative ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {badge}
        </span>
      )}
    </>
  );

  if (disabled) {
    const node = (
      <span
        aria-disabled
        className={cn(
          "group relative flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/50",
          collapsed && "justify-center px-0"
        )}
      >
        {inner}
      </span>
    );
    if (!collapsed) return node;
    return (
      <Tooltip>
        <TooltipTrigger render={node} />
        <TooltipContent side="right">{label} · Phase 2</TooltipContent>
      </Tooltip>
    );
  }

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
    <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>
  );
}

export default function HrmsSidebar({
  roles,
  permissionOverrides,
  employeeId,
  onNavigate,
  collapsed = false,
}: {
  roles: HrmsRole[];
  permissionOverrides?: Record<string, boolean>;
  employeeId: string | null;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const roleCtx = { roles, permissionOverrides };
  const isStaff = hasStaffRole(roles);
  const nav = (props: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean }) => (
    <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />
  );

  // Employee-only: a single flat personal menu, no admin sections.
  if (!isStaff) {
    return (
      <nav className="flex h-full flex-col gap-1 p-3">
        {nav({ href: "/talentos/me", label: "Dashboard", icon: LayoutDashboard, exact: true })}
        {nav({ href: "/talentos/me/attendance", label: "My Attendance", icon: CalendarClock })}
        {nav({ href: "/talentos/me/leave", label: "My Leave", icon: CalendarDays })}
        {nav({ href: "/talentos/me/salary", label: "My Salary", icon: Wallet })}
        {nav({ href: "/talentos/me/tax", label: "My Tax", icon: FileText })}
        {nav({ href: "/talentos/me/requests", label: "My Requests", icon: Inbox })}
        {nav({ href: "/talentos/me/documents", label: "My Documents", icon: FileText })}
        {nav({ href: "/talentos/me/profile", label: "My Profile", icon: UserRound })}

        <SectionLabel collapsed={collapsed}>Company</SectionLabel>
        {nav({ href: "/talentos/me/directory", label: "Directory", icon: Network })}
        {nav({ href: "/talentos/holidays", label: "Holidays", icon: CalendarCheck })}
      </nav>
    );
  }

  // Staff (super_admin / hr / manager) — full product, plus a "Me" section when
  // the account is also linked to an employee record.
  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ href: "/talentos", label: "Dashboard", icon: LayoutDashboard, exact: true })}

      <SectionLabel collapsed={collapsed}>People</SectionLabel>
      {nav({ href: "/talentos/employees", label: "Employees", icon: Users })}
      {nav({ href: "/talentos/departments", label: "Departments", icon: Building2 })}
      {nav({ href: "/talentos/recruitment", label: "Recruitment", icon: UserPlus })}

      <SectionLabel collapsed={collapsed}>Operations</SectionLabel>
      {nav({ href: "/talentos/attendance", label: "Attendance", icon: CalendarClock })}
      {nav({ href: "/talentos/leave", label: "Leave", icon: CalendarDays })}
      {canApproveLeave(roleCtx) && nav({ href: "/talentos/requests", label: "Requests", icon: Inbox })}
      {nav({ href: "/talentos/holidays", label: "Holidays", icon: CalendarCheck })}

      {canRunPayroll(roleCtx) && (
        <>
          <SectionLabel collapsed={collapsed}>Payroll</SectionLabel>
          {nav({ href: "/talentos/payroll", label: "Payroll runs", icon: Wallet, exact: true })}
          {nav({ href: "/talentos/payroll/items", label: "Payroll items", icon: ListChecks })}
          {nav({ href: "/talentos/payroll/payouts", label: "Salary payouts", icon: Banknote })}
          {nav({ href: "/talentos/payroll/compliance", label: "Government payments", icon: Landmark })}
          {nav({ href: "/talentos/payroll/declarations", label: "Tax declarations", icon: FileText })}
        </>
      )}

      <SectionLabel collapsed={collapsed}>Governance</SectionLabel>
      {nav({ href: "/talentos/analytics", label: "Analytics", icon: BarChart3 })}

      {employeeId && !roles.includes("super_admin") && (
        <>
          <SectionLabel collapsed={collapsed}>Me</SectionLabel>
          {nav({ href: "/talentos/me", label: "My Dashboard", icon: LayoutDashboard, exact: true })}
          {nav({ href: "/talentos/me/attendance", label: "My Attendance", icon: CalendarClock })}
          {nav({ href: "/talentos/me/leave", label: "My Leave", icon: CalendarDays })}
          {nav({ href: "/talentos/me/salary", label: "My Salary", icon: Wallet })}
          {nav({ href: "/talentos/me/tax", label: "My Tax", icon: FileText })}
          {nav({ href: "/talentos/me/requests", label: "My Requests", icon: Inbox })}
          {nav({ href: "/talentos/me/documents", label: "My Documents", icon: FileText })}
          {nav({ href: "/talentos/me/profile", label: "My Profile", icon: UserRound })}
          {nav({ href: "/talentos/me/directory", label: "Directory", icon: Network })}
        </>
      )}
    </nav>
  );
}
