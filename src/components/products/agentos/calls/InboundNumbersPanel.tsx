import Link from "next/link";
import { formatInZone } from "@/lib/products/agentos/calls/call-ui";
import type { InboundNumberView } from "@/lib/products/agentos/calls/public-inbound";
import { formatClock } from "@/lib/products/agentos/voice/call-format";
import CallStatusBadge from "@/components/products/agentos/calls/CallStatusBadge";
import type { CallStatus } from "@/lib/products/agentos/calls/types";

/** Company numbers that answer incoming calls with an agent, and the latest calls on each. */
export default function InboundNumbersPanel({ numbers, timeZone }: { numbers: InboundNumberView[]; timeZone: string | null }) {
  if (numbers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No number answers incoming calls yet. Choose an agent for a number on the <Link href="/commandos/settings/products/agentos/phone" className="font-semibold text-primary hover:underline">Phone numbers in CommandOS</Link>.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {numbers.map((n) => (
        <li key={n.numberId} className="rounded-2xl border border-border/50 bg-muted/20 p-3">
          <p className="text-sm font-semibold">{n.label || "Phone number"} <span className="font-mono text-xs font-normal text-muted-foreground">{n.masked}</span></p>
          <p className="text-xs text-muted-foreground">Answered by <Link href={`/agentos/bots/${n.agentId}`} className="font-medium text-foreground hover:text-primary">{n.agentName}</Link></p>
          {n.lastCalls.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No incoming calls yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/40 text-sm">
              {n.lastCalls.map((c) => (
                <li key={c.callId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0">
                    <Link href={`/agentos/calls/${c.callId}`} className="font-medium hover:text-primary">{c.caller}</Link>
                    <span className="ml-2 text-xs text-muted-foreground">{formatInZone(c.at, timeZone)}{c.durationSecs ? ` · ${formatClock(c.durationSecs)}` : ""}</span>
                    {c.summary && <span className="block max-w-md truncate text-[11px] text-muted-foreground">{c.summary}</span>}
                  </span>
                  <CallStatusBadge status={c.status as CallStatus} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
