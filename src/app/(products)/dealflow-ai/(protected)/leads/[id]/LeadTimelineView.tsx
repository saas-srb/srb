import { Eye, EyeOff } from "lucide-react";
import type { SerializedLeadTimelineEvent } from "@/lib/lead-management/types";
import { cn } from "@/lib/utils";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Staff timeline — shows every event, including staff-only ones. */
export default function LeadTimelineView({ events }: { events: SerializedLeadTimelineEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative ml-2 space-y-4 border-l border-border/60 pl-4">
      {[...events].reverse().map((e) => (
        <li key={e._id} className="relative">
          <span className="absolute -left-[22px] top-1 size-2 rounded-full bg-primary/60 ring-4 ring-background" />
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-foreground">{e.title}</p>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px]",
                e.visibleToLead ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}
              title={e.visibleToLead ? "Visible in the portal" : "Staff only"}
            >
              {e.visibleToLead ? <Eye className="size-2.5" /> : <EyeOff className="size-2.5" />}
            </span>
          </div>
          {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
            {when(e.createdAt)} · {e.actor}
          </p>
        </li>
      ))}
    </ol>
  );
}
