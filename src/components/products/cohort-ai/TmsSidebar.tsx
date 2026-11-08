"use client";

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
import { canManagePayments, canManageTraining, hasTmsStaffRole } from "@/lib/tms-roles";

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

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed?: boolean }) {
  if (collapsed) return <div className="mt-4 mb-1 border-t border-border/50" />;
  return (
    <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>
  );
}

export default function TmsSidebar({
  roles,
  permissionOverrides,
  studentId,
  onNavigate,
  collapsed = false,
}: {
  roles: TmsRole[];
  permissionOverrides?: Record<string, boolean>;
  studentId: string | null;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const nav = (props: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean }) => (
    <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />
  );
  const roleCtx = { roles, permissionOverrides };
  const isStaff = hasTmsStaffRole(roles);

  // Student-only portal. Schedule / assignments / projects / certificates /
  // payments tabs light up with their respective phases (5–8).
  if (!isStaff) {
    return (
      <nav className="flex h-full flex-col gap-1 p-3">
        {nav({ href: "/cohort-ai/me", label: "My Dashboard", icon: LayoutDashboard, exact: true })}
        {nav({ href: "/cohort-ai/me/program", label: "My Program", icon: GraduationCap })}
        {nav({ href: "/cohort-ai/me/batch", label: "My Batch", icon: Layers })}
        {nav({ href: "/cohort-ai/me/schedule", label: "Class Schedule", icon: CalendarDays })}
        {nav({ href: "/cohort-ai/me/assignments", label: "Assignments", icon: ClipboardList })}
        {nav({ href: "/cohort-ai/me/projects", label: "Live Projects", icon: FolderGit2 })}
        {nav({ href: "/cohort-ai/me/certificates", label: "Certificates", icon: BadgeCheck })}
        {nav({ href: "/cohort-ai/me/payments", label: "Payments", icon: Wallet })}
        <SectionLabel collapsed={collapsed}>Account</SectionLabel>
        {nav({ href: "/cohort-ai/me/profile", label: "Profile", icon: CircleUser })}
      </nav>
    );
  }

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ href: "/cohort-ai", label: "Dashboard", icon: LayoutDashboard, exact: true })}

      <SectionLabel collapsed={collapsed}>Training</SectionLabel>
      {nav({ href: "/cohort-ai/programs", label: "Programs", icon: GraduationCap })}
      {nav({ href: "/cohort-ai/batches", label: "Batches", icon: Layers })}
      {nav({ href: "/cohort-ai/students", label: "Students", icon: Users })}

      <SectionLabel collapsed={collapsed}>Delivery</SectionLabel>
      {nav({ href: "/cohort-ai/classes", label: "Classes", icon: CalendarDays })}
      {nav({ href: "/cohort-ai/projects", label: "Projects", icon: FolderGit2 })}
      {nav({ href: "/cohort-ai/assignments", label: "Assignments", icon: ClipboardList })}

      <SectionLabel collapsed={collapsed}>Records</SectionLabel>
      {nav({ href: "/cohort-ai/certificates", label: "Certificates", icon: BadgeCheck })}
      {canManagePayments(roleCtx) && nav({ href: "/cohort-ai/payments", label: "Payments", icon: Wallet })}
      {canManageTraining(roleCtx) && nav({ href: "/cohort-ai/placements", label: "Placements", icon: Briefcase })}

      <SectionLabel collapsed={collapsed}>Governance</SectionLabel>
      {canManageTraining(roleCtx) && nav({ href: "/cohort-ai/reports", label: "Analytics", icon: BarChart3 })}

      {studentId && !roles.includes("super_admin") && (
        <>
          <SectionLabel collapsed={collapsed}>Me</SectionLabel>
          {nav({ href: "/cohort-ai/me", label: "My Dashboard", icon: CircleUser, exact: true })}
        </>
      )}
    </nav>
  );
}
