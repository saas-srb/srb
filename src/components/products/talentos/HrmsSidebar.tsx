"use client";

import NavGroup from "@/components/products/common/NavGroup";
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
import type { AccessSubject } from "@/lib/access/can";
import { hrCan } from "@/lib/talentos-access";

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

export default function HrmsSidebar({
  roles,
  permissionOverrides,
  subject,
  employeeId,
  onNavigate,
  collapsed = false,
}: {
  roles: HrmsRole[];
  permissionOverrides?: Record<string, boolean>;
  subject: AccessSubject;
  employeeId: string | null;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const nav = (props: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean ; locked?: boolean }) => (
    (props.locked ? null : <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />)
  );

  // One menu for everyone: the Director's. What a person cannot use is locked (greyed, same place); the "Me" section is self-service and always open.
  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ href: "/talentos", label: "Dashboard", icon: LayoutDashboard, exact: true, locked: !hrCan({ subject }, "dashboard.view") })}

      <NavGroup collapsed={collapsed} label="People">
        {nav({ href: "/talentos/profile", label: "My Profile", icon: UserRound, locked: !hrCan({ subject }, "profile.view") })}
        {nav({ href: "/talentos/directory", label: "Directory", icon: Network, locked: !hrCan({ subject }, "directory.view") })}
        {nav({ href: "/talentos/employees", label: "Employees", icon: Users, locked: !hrCan({ subject }, "employees.team") && !hrCan({ subject }, "employees.all") })}
        {nav({ href: "/talentos/departments", label: "Departments", icon: Building2, locked: !hrCan({ subject }, "masters.view") })}
        {nav({ href: "/talentos/recruitment", label: "Recruitment", icon: UserPlus, locked: !hrCan({ subject }, "recruitment.view") })}

      </NavGroup>
      <NavGroup collapsed={collapsed} label="Operations">
        {nav({ href: "/talentos/attendance", label: "Attendance", icon: CalendarClock, locked: !hrCan({ subject }, "attendance.view") })}
        {nav({ href: "/talentos/leave", label: "Leave", icon: CalendarDays, locked: !hrCan({ subject }, "leave.view") })}
        {nav({ href: "/talentos/requests", label: "Requests", icon: Inbox, locked: !hrCan({ subject }, "requests.view") })}
        {nav({ href: "/talentos/holidays", label: "Holidays", icon: CalendarCheck, locked: !hrCan({ subject }, "holidays.view") })}

      </NavGroup>
      <NavGroup collapsed={collapsed} label="Payroll">
        {nav({ href: "/talentos/payroll", label: hrCan({ subject }, "payroll.view") ? "Payroll runs" : "My pay", icon: Wallet, exact: true, locked: !hrCan({ subject }, "payroll.view") && !hrCan({ subject }, "salary.view") })}
        {nav({ href: "/talentos/payroll/tax", label: "My tax", icon: FileText, locked: !hrCan({ subject }, "tax.view") })}
        {nav({ href: "/talentos/payroll/items", label: "Payroll items", icon: ListChecks, locked: !hrCan({ subject }, "payroll.view") })}
        {nav({ href: "/talentos/payroll/payouts", label: "Salary payouts", icon: Banknote, locked: !hrCan({ subject }, "payroll.view") })}
        {nav({ href: "/talentos/payroll/compliance", label: "Government payments", icon: Landmark, locked: !hrCan({ subject }, "payroll.view") })}
        {nav({ href: "/talentos/payroll/declarations", label: "Tax declarations", icon: FileText, locked: !hrCan({ subject }, "payroll.view") })}

      </NavGroup>
      <NavGroup collapsed={collapsed} label="Governance">
        {nav({ href: "/talentos/analytics", label: "Analytics", icon: BarChart3, locked: !hrCan({ subject }, "analytics.view") })}

      </NavGroup>
    </nav>
  );
}
