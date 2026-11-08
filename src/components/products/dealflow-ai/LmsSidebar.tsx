"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Briefcase,
  GraduationCap,
  Wrench,
  Building2,
  MessageSquare,
  Mail,
  Radio,
  Video,
  PhoneCall,
} from "lucide-react";
import { useEffect, useState } from "react";
import { countActiveCallsAction } from "@/app/(products)/dealflow-ai/(protected)/voice-calls/actions";
import { useLmsCan } from "@/components/products/dealflow-ai/LmsAccess";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

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
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "text-primary font-bold" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
      )}
    >
      {active && (
        <motion.span
          layoutId="lms-nav-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon className="relative size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="relative truncate">{label}</span>}
      {!collapsed && badge && (
        <span className="relative ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-black text-primary">
          {badge}
        </span>
      )}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">
        {label}
        {badge ? ` (${badge})` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed?: boolean }) {
  if (collapsed) return <div className="mt-4 mb-1 border-t border-border/50" />;
  return (
    <div className="mt-4 mb-1 px-3 text-[11px] font-black tracking-wider text-muted-foreground uppercase">
      {children}
    </div>
  );
}

/** Number of AI calls in progress, refreshed every 15 s while the tab is visible. 0 for people who can't see leads. */
function useActiveVoiceCalls(enabled: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = () => { if (document.visibilityState === "visible") countActiveCallsAction().then((c) => { if (alive) setN(c); }, () => {}); };
    tick();
    const t = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [enabled]);
  return enabled ? n : 0;
}

export default function LmsSidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const canCareers = useLmsCan("VIEW_CAREERS");
  const canLeads = useLmsCan("VIEW_LEADS");
  const liveCalls = useActiveVoiceCalls(canLeads);

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <NavLink href="/dealflow-ai" label="Dashboard" icon={LayoutDashboard} exact collapsed={collapsed} onNavigate={onNavigate} />

      <SectionLabel collapsed={collapsed}>Lead Management</SectionLabel>
      <NavLink href="/dealflow-ai/leads" label="Leads" icon={Users} collapsed={collapsed} onNavigate={onNavigate} />
      {canCareers && <NavLink href="/dealflow-ai/careers" label="Applicants" icon={UserCheck} collapsed={collapsed} onNavigate={onNavigate} />}

      <SectionLabel collapsed={collapsed}>Pipelines</SectionLabel>
      <NavLink href="/dealflow-ai/pipeline/jobs" label="Job Applications" icon={Briefcase} collapsed={collapsed} onNavigate={onNavigate} />
      <NavLink href="/dealflow-ai/pipeline/interns" label="Internship" icon={GraduationCap} collapsed={collapsed} onNavigate={onNavigate} />
      <NavLink href="/dealflow-ai/pipeline/trainees" label="Industrial Training" icon={Wrench} collapsed={collapsed} onNavigate={onNavigate} />
      <NavLink href="/dealflow-ai/pipeline/clients" label="Clients" icon={Building2} collapsed={collapsed} onNavigate={onNavigate} />

      <SectionLabel collapsed={collapsed}>AI Communications</SectionLabel>
      <NavLink href="/dealflow-ai/messages" label="Live Chat" icon={MessageSquare} collapsed={collapsed} onNavigate={onNavigate} />
      <NavLink href="/dealflow-ai/emails" label="Dedicated Email" icon={Mail} collapsed={collapsed} onNavigate={onNavigate} />
      <NavLink href="/dealflow-ai/whatsapp" label="WhatsApp Hub" icon={Radio} collapsed={collapsed} onNavigate={onNavigate} />
      <NavLink href="/dealflow-ai/voice-calls" label="AI Voice Calls" icon={PhoneCall} collapsed={collapsed} onNavigate={onNavigate} badge={liveCalls > 0 ? `${liveCalls} live` : undefined} />

      <SectionLabel collapsed={collapsed}>Pre-Sale Meetings</SectionLabel>
      <NavLink href="/dealflow-ai/meetings" label="Meetings" icon={Video} collapsed={collapsed} onNavigate={onNavigate} />
    </nav>
  );
}
