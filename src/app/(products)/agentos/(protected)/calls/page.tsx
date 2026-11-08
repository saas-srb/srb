import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader, SectionCard } from "@/components/products/agentos/AibotsUi";
import AibotsFilterBar, { type FilterField } from "@/components/products/agentos/AibotsFilterBar";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import CallDirectionBadge from "@/components/products/agentos/calls/CallDirectionBadge";
import CallRowActions from "@/components/products/agentos/calls/CallRowActions";
import ActiveCallsStrip from "@/components/products/agentos/calls/ActiveCallsStrip";
import { listActiveCalls } from "@/lib/products/agentos/calls/end";
import TestBadge from "@/components/products/agentos/calls/TestBadge";
import CallStatusBadge from "@/components/products/agentos/calls/CallStatusBadge";
import { CALL_STATUS_LABEL, CALL_TABS, formatInZone, formatPhone } from "@/lib/products/agentos/calls/call-ui";
import { companyTimeZone } from "@/lib/products/agentos/calls/guards";
import { listMergedCalls, parseMergedFilters, type MergedCallList } from "@/lib/products/agentos/calls/merged";
import { PURPOSE_BY_KEY } from "@/lib/products/agentos/calls/purposes";
import { DIRECTION_LABEL } from "@/lib/products/agentos/calls/call-display";
import { CALL_STATUSES } from "@/lib/products/agentos/calls/types";
import { can, getViewer } from "@/lib/products/agentos/viewer";
import { reconcileMyPendingCalls } from "@/lib/products/agentos/voice/call-history";
import { formatClock, formatIst } from "@/lib/products/agentos/voice/call-format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EMPTY: Record<string, { title: string; text: string }> = {
  all: { title: "No calls yet", text: "Call a lead or applicant from its page, or talk to a voice agent from the Agent Hub. Every call, its recording and what it collected shows up here." },
  upcoming: { title: "Nothing scheduled", text: "Calls you schedule wait here until their time. You can cancel or move them until they are dialed." },
  attention: { title: "Nothing needs attention", text: "Calls that fail, aren't answered or find the line busy are listed here so a person can decide whether to try again." },
};

/** Every call the viewer may see, phone and browser, in one list: all, upcoming (scheduled) and needing attention (failed / no answer). */
export default async function CallsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  const sp = await searchParams;
  const filters = parseMergedFilters(sp);
  await reconcileMyPendingCalls(viewer);
  const active = await listActiveCalls(viewer).catch(() => []);
  const timeZone = await companyTimeZone().catch(() => null);
  const isManager = can(viewer, "VOICE_CALL_MANAGE");
  const canWatchLive = can(viewer, "VOICE_CALL_TAKEOVER");

  let list: MergedCallList | null = null;
  try {
    list = await listMergedCalls(viewer, filters);
  } catch (e) {
    console.error("[agentos calls] list failed", e instanceof Error ? e.message : e);
  }

  const hrefWith = (patch: Record<string, string | null>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = Array.isArray(v) ? v[0] : v;
      if (val) qs.set(k, val);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v) qs.set(k, v);
      else qs.delete(k);
    }
    const s = qs.toString();
    return `/agentos/calls${s ? `?${s}` : ""}`;
  };

  const fields: FilterField[] = [
    { key: "q", label: "Search", type: "search", placeholder: list?.oversight ? "Person, contact or call summary" : "Contact or call summary" },
    { key: "bot", label: "Agent", type: "select", options: list?.agents ?? [], allLabel: "All agents" },
    { key: "status", label: "Status", type: "select", options: CALL_STATUSES.map((s) => ({ value: s, label: CALL_STATUS_LABEL[s] })), allLabel: "Any status" },
    ...(list?.oversight ? [{ key: "direction", label: "Type", type: "select" as const, options: (["outbound", "inbound", "web", "web_public"] as const).map((d) => ({ value: d, label: DIRECTION_LABEL[d] })), allLabel: "All types" }] : []),
    { key: "from", label: "From", type: "date" },
    { key: "to", label: "To", type: "date" },
    ...(list?.oversight ? [{ key: "scope", label: "Whose calls", type: "select" as const, options: [{ value: "mine", label: "Only mine" }], allLabel: "Everyone's" }] : []),
  ];
  const filtered = Boolean(filters.q || filters.bot || filters.status || filters.direction || filters.from || filters.to || filters.scope === "mine");
  const when = (iso: string) => (timeZone ? formatInZone(iso, timeZone) : `${formatIst(iso)} IST`);
  const badge = (n: number | undefined) => (n ? <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">{n}</span> : null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Call History"
        crumbs={[{ label: "Call History" }]}
        description={list ? `${list.total} call${list.total === 1 ? "" : "s"}${list.oversight && filters.scope === "all" ? " across every user" : " of yours"}. Open one for what was said, what was collected and who was in control.` : "Phone and browser calls with your agents."}
      />
      <ActiveCallsStrip calls={active} />
      <nav aria-label="Call views" className="flex flex-wrap gap-1 rounded-2xl border border-border/50 bg-muted/30 p-1">
        {CALL_TABS.map((t) => (
          <Link key={t.key} href={hrefWith({ tab: t.key === "all" ? null : t.key, page: null })} aria-current={filters.tab === t.key ? "page" : undefined} className={cn("rounded-xl px-3 py-1.5 text-sm font-medium transition-colors", filters.tab === t.key ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
            {t.key === "upcoming" ? badge(list?.counts.upcoming) : t.key === "attention" ? badge(list?.counts.attention) : null}
          </Link>
        ))}
      </nav>
      <AibotsFilterBar fields={fields} />
      {!list ? (
        <Notice tone="error">Couldn&apos;t load the calls. Refresh the page to try again.</Notice>
      ) : (
        <SectionCard title={CALL_TABS.find((t) => t.key === filters.tab)!.label}>
          {list.items.length === 0 ? (
            <EmptyState icon={<Phone className="size-5" />} title={filtered ? "No calls match these filters" : EMPTY[filters.tab].title}>
              {filtered ? "Try clearing a filter or widening the date range." : EMPTY[filters.tab].text}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">{filters.tab === "upcoming" ? "Scheduled for" : "When"}</th>
                    <th className="py-2 pr-3 font-semibold">Agent</th>
                    <th className="py-2 pr-3 font-semibold">Type</th>
                    <th className="py-2 pr-3 font-semibold">About</th>
                    <th className="py-2 pr-3 font-semibold">Placed by</th>
                    <th className="py-2 pr-3 font-semibold">Duration</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 text-right font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {list.items.map((c) => {
                    const label = c.target?.label || (c.phone ? formatPhone(c.phone) : "this call");
                    return (
                      <tr key={`${c.source}-${c.id}`} className="align-top transition-colors hover:bg-primary/5">
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <Link href={c.href} className="font-medium hover:text-primary">{when(c.scheduledFor && filters.tab === "upcoming" ? c.scheduledFor : c.at)}</Link>
                          {c.summary && <p className="mt-0.5 line-clamp-1 max-w-xs whitespace-normal text-[11px] text-muted-foreground">{c.summary}</p>}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="flex items-center gap-2">
                            {c.agent ? <BotAvatar icon={c.agent.icon} color={c.agent.color} imageUrl={c.agent.avatarUrl} size="sm" /> : null}
                            <span className="truncate">{c.agent?.name ?? "Deleted agent"}</span>
                          </span>
                        </td>
                        <td className="py-2.5 pr-3"><span className="flex flex-wrap items-center gap-1"><CallDirectionBadge direction={c.direction} />{c.testMode && <TestBadge />}</span></td>
                        <td className="py-2.5 pr-3">
                          {c.target ? <span className="font-medium">{c.target.label}</span> : c.caller ? <span className="font-medium">{c.caller}</span> : <span className="text-muted-foreground">{c.direction === "web" ? "Browser call" : "-"}</span>}
                          <p className="text-[11px] text-muted-foreground">{[c.purpose ? PURPOSE_BY_KEY.get(c.purpose)?.label : null, c.origin, c.phone && c.phone !== c.caller ? c.phone : null].filter(Boolean).join(" · ")}</p>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{c.mine ? "You" : c.initiatedBy}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{c.durationSecs ? formatClock(c.durationSecs) : "-"}</td>
                        <td className="py-2.5 pr-3">
                          <CallStatusBadge status={c.status} />
                          {canWatchLive && c.source === "engine" && (c.status === "dialing" || c.status === "in_progress") && (
                            <Link href={`/agentos/calls/${c.id}/live`} className="mt-1 block text-[11px] font-semibold text-primary hover:underline">Open live view</Link>
                          )}
                          {(c.statusNote || (filters.tab === "attention" && c.failureMessage)) && <p className="mt-0.5 max-w-[14rem] text-[11px] text-muted-foreground">{c.statusNote ?? c.failureMessage}</p>}
                        </td>
                        <td className="py-2.5 text-right">
                          <CallRowActions callId={c.id} label={label} actions={c.actions} timeZone={timeZone} isManager={isManager} agentId={c.agentId} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
      {list && list.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {list.page} of {list.totalPages}</span>
          <div className="flex gap-2">
            <Link href={hrefWith({ page: String(Math.max(list.page - 1, 1)) })} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={list.page <= 1} tabIndex={list.page <= 1 ? -1 : undefined}><ChevronLeft className="size-3.5" />Previous</Link>
            <Link href={hrefWith({ page: String(Math.min(list.page + 1, list.totalPages)) })} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={list.page >= list.totalPages} tabIndex={list.page >= list.totalPages ? -1 : undefined}>Next<ChevronRight className="size-3.5" /></Link>
          </div>
        </div>
      )}
    </div>
  );
}
