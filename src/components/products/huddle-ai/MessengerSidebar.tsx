"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  MessagesSquare,
  Hash,
  FolderKanban,
  Users,
  Megaphone,
  FolderOpen,
  Video,
  Search,
  Lock,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { ChatRole } from "@/lib/messenger-roles";

function NavLink({
  href,
  label,
  icon: Icon,
  exact = false,
  collapsed = false,
  soon = false,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  collapsed?: boolean;
  soon?: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname?.startsWith(href);

  const inner = (
    <>
      {active && (
        <motion.span
          layoutId="messenger-nav-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon className="relative size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="relative truncate">{label}</span>}
      {!collapsed && soon && <Lock className="relative ml-auto size-3 text-muted-foreground/60" aria-label="Coming soon" />}
      {!collapsed && !soon && badge ? (
        <span className="relative ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
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

export default function MessengerSidebar({
  onNavigate,
  collapsed = false,
  unreadDms = 0,
  unreadChannels = 0,
}: {
  roles: ChatRole[];
  permissionOverrides?: Record<string, boolean>;
  onNavigate?: () => void;
  collapsed?: boolean;
  unreadDms?: number;
  unreadChannels?: number;
  unreadNotifications?: number;
}) {
  const nav = (props: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    exact?: boolean;
    soon?: boolean;
    badge?: number;
  }) => <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />;

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ href: "/huddle-ai", label: "Dashboard", icon: LayoutDashboard, exact: true })}
      {nav({ href: "/huddle-ai/search", label: "Search", icon: Search })}

      <SectionLabel collapsed={collapsed}>Conversations</SectionLabel>
      {nav({ href: "/huddle-ai/dm", label: "Direct Messages", icon: MessagesSquare, badge: unreadDms })}
      {nav({ href: "/huddle-ai/channels", label: "Team Channels", icon: Hash, badge: unreadChannels })}
      {nav({ href: "/huddle-ai/projects", label: "Project Channels", icon: FolderKanban })}
      {nav({ href: "/huddle-ai/groups", label: "Group Chats", icon: Users })}

      <SectionLabel collapsed={collapsed}>Workspace</SectionLabel>
      {nav({ href: "/huddle-ai/announcements", label: "Announcements", icon: Megaphone })}
      {nav({ href: "/huddle-ai/files", label: "Shared Files", icon: FolderOpen })}
      {nav({ href: "/huddle-ai/meetings", label: "Meetings", icon: Video })}

      <SectionLabel collapsed={collapsed}>Governance</SectionLabel>
      {nav({ href: "/huddle-ai/settings", label: "Settings", icon: Settings })}
    </nav>
  );
}
