"use client";

import LockedNavItem from "@/components/products/common/LockedNavItem";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FileCheck2,
  Library,
  Send,
  ClipboardList,
  Trophy,
  Award,
  BarChart3,
  PieChart,
  FolderTree,
  Tags,
  Settings,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/** Which sections this viewer may see — computed on the server from the real permission model. */
export interface OtsNavFlags {
  dashboard: boolean;
  tests: boolean;
  questions: boolean;
  assignments: boolean;
  results: boolean;
  reports: boolean;
  analytics: boolean;
  categories: boolean;
  audit: boolean;
  settings: boolean;
  takeTests: boolean;
  /** May see their own results (separate from taking tests). */
  myResults: boolean;
  certificates: boolean;
  /** Tests waiting for the viewer to start / continue. */
  myOpen: number;
  /** Attempts waiting for manual evaluation (evaluators only). */
  toEvaluate: number;
}

function NavLink({
  href,
  label,
  icon: Icon,
  exact = false,
  collapsed = false,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  collapsed?: boolean;
  badge?: string | number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
      )}
    >
      {active && (
        <motion.span
          layoutId="ots-nav-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon className="relative size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="relative truncate">{label}</span>}
      {!collapsed && badge !== undefined && badge !== 0 && (
        <span className="relative ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{badge}</span>
      )}
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
  return <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>;
}

export default function OtsSidebar({ flags, onNavigate, collapsed = false }: { flags: OtsNavFlags; onNavigate?: () => void; collapsed?: boolean }) {
  const nav = (props: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; badge?: string | number ; locked?: boolean }) => (
    (props.locked ? <LockedNavItem label={props.label} icon={props.icon} collapsed={collapsed} product="evaliq" onNavigate={onNavigate} /> : <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />)
  );

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ href: "/evaliq", label: "Dashboard", icon: LayoutDashboard, exact: true , locked: !(flags.dashboard) })}

      <SectionLabel collapsed={collapsed}>Assessments</SectionLabel>
      {nav({ href: "/evaliq/tests", label: "Tests", icon: FileCheck2 , locked: !(flags.tests) })}
      {nav({ href: "/evaliq/questions", label: "Question Bank", icon: Library , locked: !(flags.questions) })}
      {nav({ href: "/evaliq/assignments", label: "Test Assignments", icon: Send , locked: !(flags.assignments) })}
      {nav({ href: "/evaliq/results", label: "Results", icon: ListChecks, badge: flags.toEvaluate , locked: !(flags.results) })}

      <SectionLabel collapsed={collapsed}>My Tests</SectionLabel>
      {nav({ href: "/evaliq/my-tests", label: "My Tests", icon: ClipboardList, badge: flags.myOpen , locked: !(flags.takeTests) })}
      {nav({ href: "/evaliq/my-results", label: "My Results", icon: Trophy , locked: !(flags.myResults) })}
      {nav({ href: "/evaliq/certificates", label: "Certificates", icon: Award , locked: !(flags.certificates) })}

      <SectionLabel collapsed={collapsed}>Insights</SectionLabel>
      {nav({ href: "/evaliq/reports", label: "Test Reports", icon: BarChart3 , locked: !(flags.reports) })}
      {nav({ href: "/evaliq/analytics", label: "Analytics", icon: PieChart , locked: !(flags.analytics) })}

      <SectionLabel collapsed={collapsed}>Setup</SectionLabel>
      {nav({ href: "/evaliq/categories/questions", label: "Question Categories", icon: FolderTree , locked: !(flags.categories) })}
      {nav({ href: "/evaliq/categories/tests", label: "Test Categories", icon: Tags , locked: !(flags.categories) })}
    </nav>
  );
}
