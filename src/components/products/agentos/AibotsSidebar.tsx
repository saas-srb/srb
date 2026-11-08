"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, MessageSquarePlus, Plus, Bot, MessagesSquare, Settings, Search, LayoutGrid, Bell, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import { buildNavGroups, isNavActive, mergeRecentAgents, type NavFlags, type NavIconKey, type NavItem } from "@/lib/products/agentos/sidebar-model";

/** Which optional sections this viewer may see — computed on the server from the real permission model. */
export type AibotsNavFlags = NavFlags;

/** One bot as the sidebar needs it — loaded from the database, never hardcoded. */
export interface SidebarBot {
  _id: string;
  name: string;
  icon: string;
  color: string;
  avatarUrl?: string | null;
  kind?: "text" | "voice";
}

/** Fired by the chat / voice UI when the viewer starts using an agent, so the sidebar lists it before the server refresh. */
export const AGENT_USED_EVENT = "agentos:agent-used";

function NavLink({
  href,
  label,
  icon,
  match = "prefix",
  collapsed = false,
  onNavigate,
  highlight = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  match?: NavItem["match"];
  collapsed?: boolean;
  onNavigate?: () => void;
  highlight?: boolean;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, { href, match });

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        highlight && !active && "bg-primary/8 text-primary hover:bg-primary/12",
        !highlight && !active && "text-muted-foreground hover:bg-primary/5 hover:text-primary",
        active && "text-primary"
      )}
    >
      {active && (
        <motion.span
          layoutId="aibots-nav-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <span className="relative flex shrink-0 items-center transition-transform duration-200 group-hover:scale-110">{icon}</span>
      {!collapsed && <span className="relative truncate">{label}</span>}
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

const NAV_ICONS: Record<NavIconKey, React.ReactNode> = {
  dashboard: <LayoutDashboard className="size-4" />,
  hub: <LayoutGrid className="size-4" />,
  create: <Plus className="size-4" />,
  chat: <MessageSquarePlus className="size-4" />,
  manage: <Bot className="size-4" />,
  chats: <MessagesSquare className="size-4" />,
  calls: <Phone className="size-4" />,
  settings: <Settings className="size-4" />,
  notifications: <Bell className="size-4" />,
};

export default function AibotsSidebar({ flags, bots: serverBots, onNavigate, collapsed = false }: { flags: AibotsNavFlags; bots: SidebarBot[]; onNavigate?: () => void; collapsed?: boolean }) {
  const [filter, setFilter] = useState("");
  // Agents used in this session, newest first; merged over the server list until the next layout render includes them.
  const [fresh, setFresh] = useState<SidebarBot[]>([]);
  useEffect(() => {
    const onUsed = (e: Event) => {
      const bot = (e as CustomEvent<SidebarBot>).detail;
      if (bot?._id) setFresh((p) => [bot, ...p.filter((b) => b._id !== bot._id)]);
    };
    window.addEventListener(AGENT_USED_EVENT, onUsed);
    return () => window.removeEventListener(AGENT_USED_EVENT, onUsed);
  }, []);
  const bots = mergeRecentAgents(fresh, serverBots, 50);
  const shown = filter ? bots.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase())) : bots;
  const common = { collapsed, onNavigate };
  const groups = buildNavGroups(flags);
  const renderItem = (i: NavItem) => <NavLink key={i.key} {...common} href={i.href} label={i.label} match={i.match} highlight={i.highlight} icon={NAV_ICONS[i.icon]} />;

  return (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="AgentOS">
      {groups.top.items.map(renderItem)}

      <SectionLabel collapsed={collapsed}>{groups.agents.label}</SectionLabel>
      {groups.agents.items.map(renderItem)}

      <SectionLabel collapsed={collapsed}>Your recent agents</SectionLabel>
      {renderItem(groups.recentLead)}
      {!collapsed && bots.length > 8 && (
        <label className="mb-1 flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground focus-within:border-primary/40">
          <Search className="size-3.5 shrink-0" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find an agent" aria-label="Find an agent" className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
      )}
      {shown.slice(0, filter ? 50 : 8).map((b) => (
        <NavLink key={b._id} {...common} href={`/agentos/b/${b._id}`} label={b.name} icon={<BotAvatar icon={b.icon} color={b.color} imageUrl={b.avatarUrl} size="sm" />} />
      ))}
      {!collapsed && bots.length > 0 && (
        <Link href="/agentos/hub" onClick={onNavigate} className="px-3 py-1.5 text-xs font-medium text-primary hover:underline">
          See all in Agent Hub
        </Link>
      )}
      {bots.length === 0 && !collapsed && <p className="px-3 py-2 text-xs text-muted-foreground">Other agents you chat or talk with show up here. Browse them in the Agent Hub.</p>}
      {filter && shown.length === 0 && !collapsed && <p className="px-3 py-2 text-xs text-muted-foreground">No agent matches “{filter}”.</p>}

      <SectionLabel collapsed={collapsed}>{groups.manage.label}</SectionLabel>
      {groups.manage.items.map(renderItem)}
    </nav>
  );
}
