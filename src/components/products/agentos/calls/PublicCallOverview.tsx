import Link from "next/link";
import { Stat } from "@/components/products/agentos/AibotsUi";
import { abuseSummary } from "@/lib/products/agentos/calls/call-display";
import type { PublicOverview } from "@/lib/products/agentos/calls/public";

/** Read-only picture of today's website calls: minutes against the daily cap, sessions, public agents, and what was refused in the last 24 hours. */
export default function PublicCallOverview({ overview }: { overview: PublicOverview }) {
  const abuse = abuseSummary(overview.abuseLast24h);
  const pct = overview.dailyCapMinutes > 0 ? Math.min(100, Math.round((overview.usedMinutesToday / overview.dailyCapMinutes) * 100)) : 100;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Minutes used today" value={`${overview.usedMinutesToday} / ${overview.dailyCapMinutes}`} hint={`${pct}% of the daily limit (day counted in UTC)`} tone={pct >= 100 ? "danger" : pct >= 80 ? "warn" : undefined} />
        <Stat label="Website calls today" value={overview.sessionsToday} />
        <Stat label="Website calls" value={overview.killSwitch ? "Switched off" : "On"} tone={overview.killSwitch ? "danger" : undefined} hint={`${overview.agents.length} public agent${overview.agents.length === 1 ? "" : "s"}`} />
      </div>

      <div>
        <p className="text-sm font-semibold">Public agents</p>
        {overview.agents.length === 0 ? (
          <p className="text-xs text-muted-foreground">No voice agent is public yet. Turn on public access in a voice agent&apos;s settings to let visitors talk to it.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border/40 text-sm">
            {overview.agents.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <Link href={`/agentos/bots/${a.id}`} className="font-medium hover:text-primary">{a.name}</Link>
                <span className="text-xs text-muted-foreground">{a.allowedOrigins.length ? `Allowed websites: ${a.allowedOrigins.join(", ")}` : "Company site only"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold">Refused in the last 24 hours{abuse.total ? ` (${abuse.total})` : ""}</p>
        {abuse.lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing was refused. Every request was within the limits.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border/40 text-sm">
            {abuse.lines.map((l) => <li key={l.kind} className="flex justify-between gap-3 py-1.5"><span>{l.label}</span><span className="font-semibold tabular-nums">{l.count}</span></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
