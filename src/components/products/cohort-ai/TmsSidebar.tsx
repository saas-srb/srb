"use client";

import NavGroup from "@/components/products/common/NavGroup";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  GraduationCap,
  Layers,
  Users,
  CalendarDays,
  FolderGit2,
  ClipboardList,
  BadgeCheck,
  Wallet,
  Briefcase,
  BarChart3,
  CircleUser,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { TmsRole } from "@/lib/tms-roles";
import type { AccessSubject } from "@/lib/access/can";
import { tmsCan } from "@/lib/tms-access";

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
          layoutId="tms-nav-active"
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

export default function TmsSidebar({
  roles,
  permissionOverrides,
  subject,
  studentId,
  onNavigate,
  collapsed = false,
}: {
  roles: TmsRole[];
  permissionOverrides?: Record<string, boolean>;
  subject: AccessSubject;
  studentId: string | null;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const nav = (props: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean ; locked?: boolean }) => (
    (props.locked ? null : <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />)
  );
  void roles; void permissionOverrides;

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ href: "/cohort-ai", label: "Dashboard", icon: LayoutDashboard, exact: true, locked: !tmsCan({ subject }, "dashboard.view") })}

      <NavGroup collapsed={collapsed} label="Training">
        {nav({ href: "/cohort-ai/programs", label: "Programs", icon: GraduationCap, locked: !tmsCan({ subject }, "programs.view") })}
        {nav({ href: "/cohort-ai/batches", label: "Batches", icon: Layers, locked: !tmsCan({ subject }, "batches.view") })}
        {nav({ href: "/cohort-ai/students", label: "Students", icon: Users, locked: !tmsCan({ subject }, "students.view") })}
      </NavGroup>
      <NavGroup collapsed={collapsed} label="Delivery">
        {nav({ href: "/cohort-ai/classes", label: "Classes", icon: CalendarDays, locked: !tmsCan({ subject }, "classes.view") })}
        {nav({ href: "/cohort-ai/projects", label: "Projects", icon: FolderGit2, locked: !tmsCan({ subject }, "projects.view") })}
        {nav({ href: "/cohort-ai/assignments", label: "Assignments", icon: ClipboardList, locked: !tmsCan({ subject }, "assignments.view") })}
      </NavGroup>
      <NavGroup collapsed={collapsed} label="Records">
        {nav({ href: "/cohort-ai/certificates", label: "Certificates", icon: BadgeCheck, locked: !tmsCan({ subject }, "certificates.view") })}
        {nav({ href: "/cohort-ai/payments", label: "Payments", icon: Wallet, locked: !tmsCan({ subject }, "payments.view") })}
        {nav({ href: "/cohort-ai/placements", label: "Placements", icon: Briefcase, locked: !tmsCan({ subject }, "placements.view") })}
      </NavGroup>
      <NavGroup collapsed={collapsed} label="Governance">
        {nav({ href: "/cohort-ai/reports", label: "Analytics", icon: BarChart3, locked: !tmsCan({ subject }, "reports.view") })}
      </NavGroup>
    </nav>
  );
}
