"use client";

import NavGroup from "@/components/products/common/NavGroup";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  CircleUser,
  CalendarDays,
  Clock,
  CheckSquare,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { PmsRole } from "@/lib/pms-roles";
import type { AccessSubject } from "@/lib/access/can";
import { pmsCan } from "@/lib/pms-access";

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
          layoutId="pms-nav-active"
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

export default function PmsSidebar({
  roles,
  permissionOverrides,
  subject,
  employeeId,
  onNavigate,
  collapsed = false,
}: {
  roles: PmsRole[];
  permissionOverrides?: Record<string, boolean>;
  subject: AccessSubject;
  employeeId: string | null;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const roleCtx = { roles, permissionOverrides };
  const nav = (props: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean ; locked?: boolean }) => (
    (props.locked ? null : <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />)
  );

  // One menu for everyone: the Director's. What a person cannot use is locked; "Me" is self-service and always open.
  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ href: "/sprintos", label: "Dashboard", icon: LayoutDashboard, exact: true, locked: !pmsCan({ subject }, "dashboard.view") })}

      <NavGroup collapsed={collapsed} label="Delivery">
        {nav({ href: "/sprintos/projects", label: "Projects", icon: FolderKanban, locked: !pmsCan({ subject }, "projects.view") && !pmsCan({ subject }, "projects.all") })}
        {nav({ href: "/sprintos/tasks", label: "My Tasks", icon: CheckSquare, locked: !pmsCan({ subject }, "projects.view") })}
        {nav({ href: "/sprintos/clients", label: "Clients", icon: Building2, locked: !pmsCan({ subject }, "clients.view") })}
        {nav({ href: "/sprintos/calendar", label: "Calendar", icon: CalendarDays, locked: !pmsCan({ subject }, "calendar.view") })}
        {nav({ href: "/sprintos/costing", label: "Costing", icon: BarChart3, locked: !pmsCan({ subject }, "costing.view") })}
      </NavGroup>
      <NavGroup collapsed={collapsed} label="Timesheets & Tracking">
        {nav({ href: "/sprintos/timesheets", label: "My Timesheet", icon: Clock, exact: true, locked: !pmsCan({ subject }, "timesheets.view") })}
        {nav({ href: "/sprintos/timesheets/review", label: "Review timesheets", icon: CheckSquare, locked: !pmsCan({ subject }, "timesheets.review") })}
      </NavGroup>
      <NavGroup collapsed={collapsed} label="Governance">
        {nav({ href: "/sprintos/analytics", label: "Analytics", icon: BarChart3, locked: !pmsCan({ subject }, "analytics.view") })}
      </NavGroup>
    </nav>
  );
}
