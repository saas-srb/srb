"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bot, BookOpen, LayoutDashboard, PlusCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

type Icon = React.ComponentType<{ className?: string }>;

function NavLink({ href, label, icon: Icon, exact = false, collapsed = false, badge, onNavigate }: { href: string; label: string; icon: Icon; exact?: boolean; collapsed?: boolean; badge?: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn("group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors", collapsed && "justify-center px-0", active ? "text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary")}
    >
      {active && <motion.span layoutId="support-nav-active" className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
      <Icon className="relative size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="relative truncate">{label}</span>}
      {!collapsed && badge ? <span className="relative ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{badge}</span> : null}
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

export default function SupportSidebar({ openRequests = 0, onNavigate, collapsed = false }: { openRequests?: number; onNavigate?: () => void; collapsed?: boolean }) {
  const common = { collapsed, onNavigate };
  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <NavLink {...common} href="/resolveiq" label="Dashboard" icon={LayoutDashboard} exact />

      <SectionLabel collapsed={collapsed}>Get help</SectionLabel>
      <NavLink {...common} href="/resolveiq/assistant" label="Help Assistant" icon={Bot} />
      <NavLink {...common} href="/resolveiq/help" label="Help Center" icon={BookOpen} />

      <SectionLabel collapsed={collapsed}>Support</SectionLabel>
      <NavLink {...common} href="/resolveiq/requests/new" label="New Request" icon={PlusCircle} exact />
      <NavLink {...common} href="/resolveiq/requests" label="My Requests" icon={Inbox} exact badge={openRequests} />
    </nav>
  );
}
