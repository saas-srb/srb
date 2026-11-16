"use client";

import NavGroup from "@/components/products/common/NavGroup";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Gauge,
  ScanSearch,
  Wrench,
  FileCode2,
  KeyRound,
  TrendingUp,
  FileText,
  Network,
  Link2,
  Swords,
  Map,
  Bot,
  Braces,
  Files,
  TriangleAlert,
  ListChecks,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/** Which optional sections this viewer may see — computed on the server from the real permission model. */
export interface SeoNavFlags {
  settings: boolean;
  audit: boolean;
  /** Which pages the person may open (module view features); the menu hides the rest. */
  see: Record<string, boolean>;
  /** Open critical issues (badge). */
  critical: number;
  /** Open tasks assigned to the viewer (badge). */
  myTasks: number;
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
          layoutId="seo-nav-active"
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

export default function SeoSidebar({ flags, onNavigate, collapsed = false }: { flags: SeoNavFlags; onNavigate?: () => void; collapsed?: boolean }) {
  const nav = (props: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; badge?: string | number; feature: string }) =>
    flags.see[props.feature] ? <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} /> : null;

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ feature: "dashboard", href: "/rankmax-ai", label: "Dashboard", icon: LayoutDashboard, exact: true })}
      {nav({ feature: "overview", href: "/rankmax-ai/overview", label: "SEO Overview", icon: Gauge })}

      <NavGroup collapsed={collapsed} label="Audit">
        {nav({ feature: "audit", href: "/rankmax-ai/audit", label: "Website Audit", icon: ScanSearch })}
        {nav({ feature: "technical", href: "/rankmax-ai/technical", label: "Technical SEO", icon: Wrench })}
        {nav({ feature: "onpage", href: "/rankmax-ai/on-page", label: "On-Page SEO", icon: FileCode2 })}
        {nav({ feature: "content", href: "/rankmax-ai/content", label: "Content SEO", icon: FileText })}
        {nav({ feature: "pages", href: "/rankmax-ai/pages", label: "Pages", icon: Files })}
      </NavGroup>
      <NavGroup collapsed={collapsed} label="Search">
        {nav({ feature: "keywords", href: "/rankmax-ai/keywords", label: "Keywords", icon: KeyRound })}
        {nav({ feature: "rankings", href: "/rankmax-ai/rankings", label: "Rankings", icon: TrendingUp })}
        {nav({ feature: "competitors", href: "/rankmax-ai/competitors", label: "Competitors", icon: Swords })}
      </NavGroup>
      <NavGroup collapsed={collapsed} label="Links">
        {nav({ feature: "internallinks", href: "/rankmax-ai/internal-links", label: "Internal Links", icon: Network })}
        {nav({ feature: "backlinks", href: "/rankmax-ai/backlinks", label: "Backlinks", icon: Link2 })}
      </NavGroup>
      <NavGroup collapsed={collapsed} label="Crawl & Index">
        {nav({ feature: "sitemap", href: "/rankmax-ai/sitemap", label: "Sitemap", icon: Map })}
        {nav({ feature: "robots", href: "/rankmax-ai/robots", label: "Robots.txt", icon: Bot })}
        {nav({ feature: "schema", href: "/rankmax-ai/schema", label: "Schema / Structured Data", icon: Braces })}
      </NavGroup>
      <NavGroup collapsed={collapsed} label="Work">
        {nav({ feature: "issues", href: "/rankmax-ai/issues", label: "SEO Issues", icon: TriangleAlert, badge: flags.critical })}
        {nav({ feature: "tasks", href: "/rankmax-ai/tasks", label: "SEO Tasks", icon: ListChecks, badge: flags.myTasks })}
        {nav({ feature: "reports", href: "/rankmax-ai/reports", label: "Reports", icon: BarChart3 })}
      </NavGroup>
    </nav>
  );
}
