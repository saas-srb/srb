"use client";

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
  const nav = (props: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; badge?: string | number }) => (
    <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />
  );

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ href: "/rankmax-ai", label: "Dashboard", icon: LayoutDashboard, exact: true })}
      {nav({ href: "/rankmax-ai/overview", label: "SEO Overview", icon: Gauge })}

      <SectionLabel collapsed={collapsed}>Audit</SectionLabel>
      {nav({ href: "/rankmax-ai/audit", label: "Website Audit", icon: ScanSearch })}
      {nav({ href: "/rankmax-ai/technical", label: "Technical SEO", icon: Wrench })}
      {nav({ href: "/rankmax-ai/on-page", label: "On-Page SEO", icon: FileCode2 })}
      {nav({ href: "/rankmax-ai/content", label: "Content SEO", icon: FileText })}
      {nav({ href: "/rankmax-ai/pages", label: "Pages", icon: Files })}

      <SectionLabel collapsed={collapsed}>Search</SectionLabel>
      {nav({ href: "/rankmax-ai/keywords", label: "Keywords", icon: KeyRound })}
      {nav({ href: "/rankmax-ai/rankings", label: "Rankings", icon: TrendingUp })}
      {nav({ href: "/rankmax-ai/competitors", label: "Competitors", icon: Swords })}

      <SectionLabel collapsed={collapsed}>Links</SectionLabel>
      {nav({ href: "/rankmax-ai/internal-links", label: "Internal Links", icon: Network })}
      {nav({ href: "/rankmax-ai/backlinks", label: "Backlinks", icon: Link2 })}

      <SectionLabel collapsed={collapsed}>Crawl & Index</SectionLabel>
      {nav({ href: "/rankmax-ai/sitemap", label: "Sitemap", icon: Map })}
      {nav({ href: "/rankmax-ai/robots", label: "Robots.txt", icon: Bot })}
      {nav({ href: "/rankmax-ai/schema", label: "Schema / Structured Data", icon: Braces })}

      <SectionLabel collapsed={collapsed}>Work</SectionLabel>
      {nav({ href: "/rankmax-ai/issues", label: "SEO Issues", icon: TriangleAlert, badge: flags.critical })}
      {nav({ href: "/rankmax-ai/tasks", label: "SEO Tasks", icon: ListChecks, badge: flags.myTasks })}
      {nav({ href: "/rankmax-ai/reports", label: "Reports", icon: BarChart3 })}
    </nav>
  );
}
