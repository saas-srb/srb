import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Clock, Hash, KeyRound, MessageSquare, Circle, Video } from "lucide-react";
import MeetingControls from "@/components/products/huddle-ai/MeetingControls";
import PresenceDot from "@/components/products/huddle-ai/PresenceDot";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { getMeeting, canAccessMeeting, getMeetingDetail, listParticipants } from "@/lib/products/huddle-ai/meetings";
import { getChannel } from "@/lib/products/huddle-ai/channels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RSVP_LABEL: Record<string, string> = { yes: "Going", no: "Can't make it", maybe: "Maybe" };

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentChatUser();
  if (!user) return null;

  const meeting = await getMeeting(id);
  if (!meeting || !(await canAccessMeeting(meeting, user))) notFound();

  const [detail, participants, channel] = await Promise.all([
    getMeetingDetail(id, user.id),
    listParticipants(id),
    meeting.channelId ? getChannel(meeting.channelId) : Promise.resolve(null),
  ]);
  if (!detail) notFound();

  const isHost = detail.hostId === user.id;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="space-y-4">
<PanelPageHeader
            title={<>{detail.title}</>}
          />
<div className="space-y-4">

        <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize",
                detail.status === "live"
                  ? "bg-green-500/15 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {detail.status === "live" && <Circle className="size-2 animate-pulse fill-current" />}
              {detail.status}
            </span>
            <span className="rounded-full border border-border/60 px-2.5 py-0.5 text-[11px] text-muted-foreground capitalize">
              {detail.kind}
            </span>
          </div>

          {detail.description && <p className="mt-1 text-sm text-muted-foreground">{detail.description}</p>}

          <dl className="mt-4 grid gap-2 border-t border-border/60 pt-4 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              {new Date(detail.startAt).toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              {detail.durationMins} minutes
            </div>
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" />
              Join code <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{detail.joinCode}</code>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Video className="size-4" />
              Transport: {detail.transport} · recording {detail.recordingEnabled ? "on" : "off"} · screen-share{" "}
              {detail.screenShareEnabled ? "on" : "off"}
            </div>
          </dl>

          <div className="mt-4 border-t border-border/60 pt-4">
            <MeetingControls id={id} status={detail.status} isHost={isHost} myRsvp={detail.myRsvp} />
          </div>

          {channel && (
            <Link
              href={`/huddle-ai/groups/${channel.slug}`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <MessageSquare className="size-3.5" />
              Open meeting chat
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
            <Hash className="size-3.5" /> Participants ({participants.length})
          </h2>
          <ul className="space-y-1">
            {participants.map((p) => (
              <li key={p.userId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                <span className="relative flex size-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {(p.user?.displayName ?? "?").slice(0, 1).toUpperCase()}
                  <PresenceDot status={p.presence} ring className="absolute -right-0.5 -bottom-0.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.user?.displayName ?? "Unknown"}</span>
                {p.inMeeting && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
                    <Circle className="size-2 fill-current" /> in call
                  </span>
                )}
                {!p.inMeeting && p.role !== "host" && p.rsvp && (
                  <span className="text-[11px] text-muted-foreground">{RSVP_LABEL[p.rsvp]}</span>
                )}
                {p.role === "host" && <span className="text-[11px] text-muted-foreground">Host</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
</div>
    </div>
  );
}
