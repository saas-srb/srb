"use client";

import NavGroup from "@/components/products/common/NavGroup";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, Building2, Users, KeyRound, Files, Link2, StickyNote, CalendarClock, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/** Which optional sections this viewer may see — computed on the server from the real permission model. */
export interface DlmsNavFlags {
  dashboard: boolean;
  /** Company vault visible (the person holds the feature and has access to it). */
  company: boolean;
  clients: boolean;
  credentials: boolean;
  documents: boolean;
  urls: boolean;
  notes: boolean;
  expiry: boolean;
  audit: boolean;
  settings: boolean;
  /** Expired items in the viewer's scope (badge). */
  expired: number;
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
          layoutId="dlms-nav-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon className="relative size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="relative truncate">{label}</span>}
      {!collapsed && badge !== undefined && badge !== 0 && (
        <span className="relative ml-auto rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">{badge}</span>
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

export default function DlmsSidebar({ flags, onNavigate, collapsed = false }: { flags: DlmsNavFlags; onNavigate?: () => void; collapsed?: boolean }) {
  const nav = (props: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; badge?: string | number ; locked?: boolean }) => (
    (props.locked ? null : <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />)
  );

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {nav({ href: "/cybervault", label: "Dashboard", icon: LayoutDashboard, exact: true, locked: !flags.dashboard })}

      <NavGroup collapsed={collapsed} label="Owners">
        {nav({ href: "/cybervault/company", label: "Company Vault", icon: Building2 , locked: !(flags.company) })}
        {nav({ href: "/cybervault/clients", label: "Clients Vault", icon: Users, locked: !flags.clients })}

      </NavGroup>
      <NavGroup collapsed={collapsed} label="Vault">
        {nav({ href: "/cybervault/credentials", label: "Credential Vault", icon: KeyRound, locked: !flags.credentials })}
        {nav({ href: "/cybervault/documents", label: "Document Vault", icon: Files, locked: !flags.documents })}
        {nav({ href: "/cybervault/urls", label: "URLs & Accounts", icon: Link2, locked: !flags.urls })}
        {nav({ href: "/cybervault/notes", label: "Notes", icon: StickyNote, locked: !flags.notes })}

      </NavGroup>
      <NavGroup collapsed={collapsed} label="Governance">
        {nav({ href: "/cybervault/expiry", label: "Expiry & Alerts", icon: CalendarClock, badge: flags.expired, locked: !flags.expiry })}
    
      </NavGroup>
    </nav>
  );
}
