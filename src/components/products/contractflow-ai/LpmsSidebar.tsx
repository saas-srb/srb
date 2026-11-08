"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Library,
  CheckSquare,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/** Which optional sections this viewer may see — computed on the server from the real permission model. */
export interface LpmsNavFlags {
  canCreate: boolean;
  canManageTemplates: boolean;
  canManageMakers: boolean;
  canApprove: boolean;
  canSign: boolean;
  canViewAudit: boolean;
  canSettings: boolean;
  pendingApprovals: number;
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
  const active = exact ? pathname === href : pathname?.startsWith(href);

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
          layoutId="lpms-nav-active"
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

export default function LpmsSidebar({ flags, onNavigate, collapsed = false }: { flags: LpmsNavFlags; onNavigate?: () => void; collapsed?: boolean }) {
  const nav = (props: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; badge?: string | number }) => (
    <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />
  );

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ href: "/contractflow-ai", label: "Dashboard", icon: LayoutDashboard, exact: true })}

      <SectionLabel collapsed={collapsed}>Earlier version</SectionLabel>
      {nav({ href: "/contractflow-ai/documents", label: "Old documents", icon: Library })}
      {flags.canApprove && nav({ href: "/contractflow-ai/approvals", label: "Approvals", icon: CheckSquare, badge: flags.pendingApprovals })}

      {flags.canSettings && <SectionLabel collapsed={collapsed}>Governance</SectionLabel>}
      {flags.canSettings && nav({ href: "/contractflow-ai/settings", label: "Settings", icon: Settings })}
    </nav>
  );
}
