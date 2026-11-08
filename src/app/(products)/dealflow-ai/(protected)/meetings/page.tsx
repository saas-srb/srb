import Link from "next/link";
import { CalendarCheck, CalendarClock, CheckCircle2, Radio, Video, Bot } from "lucide-react";
import { requireLmsPage } from "@/lib/lms-auth";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import PanelFilterBar, { type PanelFilterField } from "@/components/platform/panel/PanelFilterBar";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import { CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import ParticipantStack from "@/components/products/dealflow-ai/meetings/ParticipantStack";
import MeetingsCalendar from "@/components/products/dealflow-ai/meetings/MeetingsCalendar";
import ScheduleButton from "@/components/products/dealflow-ai/meetings/ScheduleButton";
import { listMeetings, toMeetingView } from "@/lib/dealflow-ai/db-meetings";
import { isMeetingManager, staffProfile } from "@/lib/dealflow-ai/meetings/access";
import { listStaffOptions } from "@/lib/dealflow-ai/meetings/service";
import { bucketOf, formatWhen, STATUS_STYLE } from "@/lib/dealflow-ai/meetings/ui";
import { listAgentsFor } from "@/lib/products/agentos/picker";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const nowMs = () => Date.now();
const monthStartDate = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);

type SP = { tab?: string; view?: string; q?: string; status?: string; agent?: string; person?: string };
const TABS = ["upcoming", "live", "past", "cancelled"] as const;
type Tab = (typeof TABS)[number];

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireLmsPage("VIEW_LEADS");
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "upcoming";
  const view = sp.view === "week" || sp.view === "month" ? sp.view : "list";
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 80);

  // The AgentOS voice agents this user may bring into a meeting (empty when none exist or they have no AgentOS access), and the team they can invite.
  const [agents, staff, profile, all] = await Promise.all([
    listAgentsFor({ kind: "voice" }),
    listStaffOptions("", 300),
    staffProfile(user.id),
    listMeetings({ ...(isMeetingManager(user) ? {} : { visibleTo: user.id }), limit: 500 }),
  ]);
  const now = nowMs();
  const meetings = all.map((m) => toMeetingView(m));

  const matches = (m: (typeof meetings)[number]) =>
    (!sp.status || m.status === sp.status) &&
    (!sp.person || m.participants.some((p) => p.kind === "internal" && p.refId === sp.person)) &&
    (!sp.agent || m.participants.some((p) => p.kind === "agent" && p.refId === sp.agent)) &&
    (!q || m.title.toLowerCase().includes(q) || m.participants.some((p) => p.name.toLowerCase().includes(q) || (p.email ?? "").includes(q) || (p.company ?? "").toLowerCase().includes(q)));
  const filtered = meetings.filter(matches);
  const inTab = (m: (typeof meetings)[number], t: Tab) => (t === "cancelled" ? m.status === "cancelled" : m.status !== "cancelled" && bucketOf(m, now) === t);
  const shown = filtered.filter((m) => inTab(m, tab)).sort((a, b) => (tab === "upcoming" || tab === "live" ? a.scheduledAt.localeCompare(b.scheduledAt) : b.scheduledAt.localeCompare(a.scheduledAt)));

  const monthStart = monthStartDate().toISOString();
  const completedThisMonth = meetings.filter((m) => m.status === "ended" && (m.endedAt ?? m.scheduledAt) >= monthStart).length;
  const agentsUsed = new Set(meetings.flatMap((m) => m.participants.filter((p) => p.kind === "agent" && p.refId).map((p) => p.refId!))).size;

  const href = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const next = { ...sp, ...over };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return `/dealflow-ai/meetings${s ? `?${s}` : ""}`;
  };

  const fields: PanelFilterField[] = [
    { key: "q", label: "Search", type: "search", placeholder: "Title, person or company" },
    { key: "status", label: "Status", type: "select", allLabel: "All statuses", options: Object.entries(STATUS_STYLE).map(([value, v]) => ({ value, label: v.label })) },
    { key: "agent", label: "AI agent", type: "select", allLabel: "All agents", options: agents.map((a) => ({ value: a.id, label: a.name })) },
    { key: "person", label: "Participant", type: "select", allLabel: "Everyone", options: staff.map((s) => ({ value: s.id, label: s.name })) },
  ];

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Meetings" }]}
        title="Meetings"
        description="Video meetings with your team, your guests and AI agents that answer when addressed by name."
        actions={
          <>
            <Link href={href({ view: view === "list" ? "month" : "", tab: undefined })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <CalendarClock className="size-4" />{view === "list" ? "Calendar" : "List view"}
            </Link>
            <ScheduleButton staff={staff} agents={agents} me={{ id: user.id, name: profile?.name ?? user.email }} />
          </>
        }
        filters={<PanelFilterBar title="Search & Filters" description={`Showing ${filtered.length} of ${meetings.length} · refine the list below in real time`} fields={fields} />}
      />

      <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Total meetings" value={meetings.length} accent icon={<Video className="size-4" />} />
          <KpiCard label="Upcoming" value={meetings.filter((m) => inTab(m, "upcoming")).length} icon={<CalendarCheck className="size-4" />} />
          <KpiCard label="Live now" value={meetings.filter((m) => m.status === "live").length} icon={<Radio className="size-4" />} />
          <KpiCard label="Completed this month" value={completedThisMonth} icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="AI agents used" value={agentsUsed} icon={<Bot className="size-4" />} />
        </div>

        {view === "list" ? (
          <>
            <PanelTabs
              label="Meetings"
              active={tab}
              tabs={[
                { key: "upcoming", label: "Upcoming", href: href({ tab: "upcoming" }), count: filtered.filter((m) => inTab(m, "upcoming")).length },
                { key: "live", label: "Live now", href: href({ tab: "live" }), count: filtered.filter((m) => inTab(m, "live")).length },
                { key: "past", label: "Past", href: href({ tab: "past" }), count: filtered.filter((m) => inTab(m, "past")).length },
                { key: "cancelled", label: "Cancelled", href: href({ tab: "cancelled" }), count: filtered.filter((m) => inTab(m, "cancelled")).length },
              ]}
            />
            <GlassCard>
              <CardContent className="overflow-x-auto py-3">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Meeting</th>
                      <th className="py-2 pr-3 font-medium">When</th>
                      <th className="py-2 pr-3 font-medium">People</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 font-medium sr-only">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((m) => (
                      <tr key={m.roomId} className="border-b border-border/40 last:border-0">
                        <td className="py-2 pr-3">
                          <Link href={`/dealflow-ai/meetings/${m.roomId}/details`} className="font-medium text-foreground hover:text-primary hover:underline">{m.title}</Link>
                          <span className="block text-xs text-muted-foreground">{m.target ? `About ${m.target.label}` : `${m.durationMinutes} min`}{m.summary ? " · summary ready" : ""}</span>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{formatWhen(m.scheduledAt, m.timezone)}<span className="block text-xs">{m.durationMinutes} min</span></td>
                        <td className="py-2 pr-3"><ParticipantStack participants={m.participants} agents={agents} /></td>
                        <td className="py-2 pr-3"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", STATUS_STYLE[m.status].className)}>{STATUS_STYLE[m.status].label}</span></td>
                        <td className="py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/dealflow-ai/meetings/${m.roomId}/details`} className={buttonVariants({ variant: "outline", size: "sm" })}>Details</Link>
                            {(m.status === "live" || m.status === "scheduled") && <Link href={`/dealflow-ai/meetings/${m.roomId}`} className={buttonVariants({ size: "sm" })}><Video className="size-3.5" />{m.status === "live" ? "Join now" : "Join"}</Link>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {shown.length === 0 && (
                      <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">{meetings.length === 0 ? "No meetings yet. Schedule your first meeting." : "No meetings match."}</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </GlassCard>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <Link href={href({ view: "week" })} className={buttonVariants({ variant: view === "week" ? "default" : "outline", size: "sm" })}>Week</Link>
              <Link href={href({ view: "month" })} className={buttonVariants({ variant: view === "month" ? "default" : "outline", size: "sm" })}>Month</Link>
            </div>
            <MeetingsCalendar view={view} meetings={filtered} />
          </>
        )}
      </>
    </div>
  );
}
