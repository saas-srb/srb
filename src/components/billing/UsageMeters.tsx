import { Bot, Globe, HardDrive, Mail, MessageSquare, Mic, Users, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLimitValue } from "@/lib/platform/billing/types";
import type { UsageRow } from "@/lib/platform/billing/usage-summary";

const ICON: Record<string, LucideIcon> = { seats: Users, storageMb: HardDrive, aiTokensPerMonth: Bot, emailsPerMonth: Mail, voiceMinutesPerMonth: Mic, customDomains: Globe };

/** A count in the service's own unit; zero is just "0", never "Not included". */
const fmtUsed = (key: string, v: number) => (v === 0 ? "0" : key === "seats" || key === "customDomains" ? String(v) : formatLimitValue(key, v));

/** This month's use of every service in the plan against its allowance, as tiles. Read-only: more of anything means a bigger plan. */
export default function UsageMeters({ rows }: { rows: UsageRow[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => {
        const Icon = ICON[r.limitKey] ?? Zap;
        const tone = r.percent >= 90 ? "bg-destructive" : r.percent >= 70 ? "bg-amber-500" : "bg-primary";
        const none = r.limit === 0;
        return (
          <li key={r.limitKey} className={cn("rounded-2xl border border-border/70 bg-card/70 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40", none && "opacity-60")}>
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{r.label}</p>
                {r.provider ? <p className="truncate text-xs text-muted-foreground">via {r.provider}</p> : null}
              </div>
            </div>
            <p className="mt-3 flex items-baseline gap-1.5 tabular-nums">
              <span className="text-2xl font-black">{fmtUsed(r.limitKey, r.used)}</span>
              <span className="text-sm text-muted-foreground">{none ? "· not in your plan" : `of ${r.limit === null ? "Unlimited" : fmtUsed(r.limitKey, r.limit)}`}</span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={r.percent} aria-valuemin={0} aria-valuemax={100} aria-label={r.label}>
              <div className={cn("h-full rounded-full transition-all duration-700", tone)} style={{ width: `${r.limit === null ? 0 : Math.max(r.percent, r.used > 0 ? 3 : 0)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{r.note}</p>
          </li>
        );
      })}
    </ul>
  );
}
