"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Target,
  Settings,
  Send,
  Ban,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { activeCfItem, cfCurrentTask, groupedCfNav, visibleCfNav, type CfNavIcon } from "@/lib/products/contractflow-ai/nav";
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
  active,
  collapsed = false,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed?: boolean;
  badge?: string | number;
  onNavigate?: () => void;
}) {
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

const ICONS: Record<CfNavIcon, React.ComponentType<{ className?: string }>> = { dashboard: LayoutDashboard, documents: FileText, sop: ClipboardList, kpi: Target, archive: Archive, settings: Settings };

export default function LpmsSidebar({ flags, onNavigate, collapsed = false }: { flags: LpmsNavFlags; onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname() ?? "";
  const navFlags = { settings: flags.canSettings };
  const groups = groupedCfNav(navFlags);
  const active = activeCfItem(visibleCfNav(navFlags), pathname);
  const task = cfCurrentTask(pathname);

  return (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="ContractFlow">
      {groups.map((g, gi) => (
        <div key={g.key} role="group" aria-label={g.label} className="flex flex-col gap-1">
          {gi > 0 && <SectionLabel collapsed={collapsed}>{g.label}</SectionLabel>}
          {gi === 0 && !collapsed && <div className="mb-1 px-3 pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</div>}
          {g.items.map((i) => <NavLink key={i.key} href={i.href} label={i.label} icon={ICONS[i.icon]} active={active?.key === i.key} collapsed={collapsed} onNavigate={onNavigate} />)}
          {g.key === "overview" && task && (
            <>
              <SectionLabel collapsed={collapsed}>Current task</SectionLabel>
              <NavLink href={pathname} label={task.label} icon={pathname.endsWith("/void") ? Ban : Send} active collapsed={collapsed} onNavigate={onNavigate} />
            </>
          )}
        </div>
      ))}
    </nav>
  );
}
