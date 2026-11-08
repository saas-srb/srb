import Link from "next/link";
import { Activity, PhoneCall } from "lucide-react";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import TestBadge from "@/components/products/agentos/calls/TestBadge";
import CallStatusBadge from "@/components/products/agentos/calls/CallStatusBadge";
import { listCalls, type CallView } from "@/lib/products/agentos/calls/engine";
import { getBot } from "@/lib/products/agentos/bots";
import { PURPOSE_BY_KEY } from "@/lib/products/agentos/calls/purposes";
import { labelCollected } from "@/lib/products/agentos/calls/call-ui";
import { getViewer } from "@/lib/products/agentos/viewer";
import { listCallResults } from "@/lib/dealflow-ai/call-results";
import { DEALFLOW_PRODUCT } from "@/lib/dealflow-ai/call-targets";
import "@/lib/dealflow-ai/call-hooks";
import { formatDateTime } from "@/lib/utils";

const LIVE = new Set(["dialing", "in_progress"]);
const OUTCOME = { success: "Successful", failure: "Unsuccessful", unknown: "Unclear" } as const;

/**
 * The "AI calls" section of a lead, applicant or submission page: every AI call about this record (status, when, agent, summary, a link to
 * the call, and a live link while it runs) and, under each finished call, the answers it collected. Calls come from the calling engine
 * (what this person is allowed to see there); the answers are the copies DealFlow stored when the call ended.
 */
export default async function DealflowCallHistory({ entityType, entityId }: { entityType: "lead" | "applicant" | "submission"; entityId: string }) {
  const viewer = await getViewer().catch(() => null);
  const [calls, stored] = await Promise.all([
    viewer ? listCalls(viewer, { scope: "all", target: { product: DEALFLOW_PRODUCT, entityType, entityId } }).then((r) => r.items).catch(() => [] as CallView[]) : Promise.resolve([] as CallView[]),
    listCallResults(entityType, entityId),
  ]);
  const byCall = new Map(stored.map((s) => [s._id, s]));
  const agentIds = [...new Set(calls.map((c) => c.agentId))];
  const agents = new Map(await Promise.all(agentIds.map(async (id) => [id, (await getBot(id).catch(() => null))?.name ?? "Voice agent"] as const)));
  // Calls the engine can't show this person but DealFlow stored (no AgentOS access): still listed from the stored copy.
  const extra = stored.filter((s) => !calls.some((c) => c.id === s._id));

  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><PhoneCall className="size-4" /> AI calls</CardTitle>
        <CardDescription>Calls placed by a team member with an AI voice agent. Answers collected on a call are stored here; nothing on the record above is changed.</CardDescription>
      </CardHeader>
      <CardContent>
        {calls.length === 0 && extra.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{viewer ? "No AI calls yet." : "No AI calls yet. Seeing call history needs an AgentOS account."}</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {calls.map((c) => {
              const s = byCall.get(c.id);
              const collected = labelCollected(s?.collected ?? c.collected, null);
              return (
                <li key={c.id} className="space-y-1.5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <CallStatusBadge status={c.status} />
                    {"testMode" in c && c.testMode && <TestBadge />}
                    <span className="text-xs text-muted-foreground">{formatDateTime(c.scheduledFor && c.status === "scheduled" ? c.scheduledFor : c.createdAt)} · {agents.get(c.agentId)} · {PURPOSE_BY_KEY.get(c.purpose)?.label ?? c.purpose}</span>
                    {c.outcome && c.outcome !== "unknown" && <span className="text-xs text-muted-foreground">· {OUTCOME[c.outcome]}</span>}
                    <span className="ml-auto flex gap-3 text-xs">
                      {LIVE.has(c.status) && <Link href={`/agentos/calls/${c.id}/live`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><Activity className="size-3" /> Watch live</Link>}
                      <Link href={`/agentos/calls/${c.id}`} className="text-primary hover:underline">Open call</Link>
                    </span>
                  </div>
                  {(s?.summary ?? c.summary) && <p className="text-muted-foreground">{s?.summary ?? c.summary}</p>}
                  {collected.length > 0 && (
                    <dl className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                      {collected.map((f) => (<div key={f.key} className="flex justify-between gap-2"><dt className="text-muted-foreground">{f.label}</dt><dd className="text-right text-foreground">{f.value}</dd></div>))}
                    </dl>
                  )}
                </li>
              );
            })}
            {extra.map((s) => (
              <li key={s._id} className="space-y-1.5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <CallStatusBadge status={s.status} />
                  <span className="text-xs text-muted-foreground">{s.endedAt ? formatDateTime(s.endedAt) : formatDateTime(s.createdAt)} · {PURPOSE_BY_KEY.get(s.purpose)?.label ?? s.purpose}</span>
                </div>
                {s.summary && <p className="text-muted-foreground">{s.summary}</p>}
                {s.collected.length > 0 && <dl className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">{s.collected.map((f) => (<div key={f.key} className="flex justify-between gap-2"><dt className="text-muted-foreground">{f.label}</dt><dd className="text-right text-foreground">{f.value}</dd></div>))}</dl>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </GlassCard>
  );
}
