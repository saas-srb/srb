import {
  UserPlus,
  Send,
  Flag,
  StickyNote,
  MessageSquareText,
  CalendarClock,
  FileText,
  GraduationCap,
  FolderKanban,
  BadgeCheck,
  Award,
  UserCheck,
  CircleDot,
  PhoneCall,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SerializedLeadTimelineEvent, LeadEventKind } from "@/lib/lead-management/types";
import { cn } from "@/lib/utils";

const ICON: Record<LeadEventKind, LucideIcon> = {
  account_created: UserPlus,
  lead_submitted: Send,
  stage_changed: Flag,
  note_added: StickyNote,
  message_sent: MessageSquareText,
  interview_scheduled: CalendarClock,
  interview_updated: CalendarClock,
  document_shared: FileText,
  document_requested: FileText,
  linked_student: GraduationCap,
  linked_project: FolderKanban,
  offer_released: BadgeCheck,
  enrolled: GraduationCap,
  certificate_issued: Award,
  owner_assigned: UserCheck,
  ai_call: PhoneCall,
  meeting: CalendarClock,
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The person's complete journey — a polished vertical timeline. */
export default function LeadJourney({ events }: { events: SerializedLeadTimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Your journey will appear here as our team progresses your request.</p>;
  }
  const ordered = [...events].reverse(); // newest first
  return (
    <ol className="relative ml-3 space-y-6 border-l-2 border-border/60 pl-6">
      {ordered.map((e, i) => {
        const Icon = ICON[e.kind] ?? CircleDot;
        const newest = i === 0;
        return (
          <li key={e._id} className="relative">
            <span
              className={cn(
                "absolute -left-[35px] flex size-6 items-center justify-center rounded-full ring-4 ring-background",
                newest ? "bg-gradient-to-br from-primary to-brand-accent text-white" : "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <p className="text-sm font-semibold text-foreground">{e.title}</p>
            {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">{when(e.createdAt)}</p>
          </li>
        );
      })}
    </ol>
  );
}
