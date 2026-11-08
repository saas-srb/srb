import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Video, Clock, Users, Circle } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import NewMeetingButton from "@/components/products/huddle-ai/NewMeetingButton";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { listMeetingsForUser } from "@/lib/products/huddle-ai/meetings";
import { listDirectoryUsers } from "@/lib/products/huddle-ai/users";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  live: "text-green-600 dark:text-green-400",
  scheduled: "text-muted-foreground",
  ended: "text-muted-foreground/70",
  cancelled: "text-destructive/70 line-through",
};

export default async function MeetingsPage() {
  const user = await getCurrentChatUser();
  if (!user) return null;

  const [upcoming, past, directory] = await Promise.all([
    listMeetingsForUser(user.id, "upcoming"),
    listMeetingsForUser(user.id, "past"),
    listDirectoryUsers(user.id),
  ]);

  const row = (m: (typeof upcoming)[number]) => (
    <Link
      key={m._id}
      href={`/huddle-ai/meetings/${m._id}`}
      className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3 transition-colors hover:border-primary/40"
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          m.status === "live" ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-primary/10 text-primary"
        )}
      >
        <Video className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{m.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {m.hostName} ·{" "}
          {new Date(m.startAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ·{" "}
          {m.durationMins} min
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Users className="size-3" />
          {m.participantCount}
        </span>
        <span className={cn("inline-flex items-center gap-1 font-medium capitalize", STATUS_STYLE[m.status])}>
          {m.status === "live" && <Circle className="size-2 animate-pulse fill-current" />}
          {m.status}
        </span>
      </span>
    </Link>
  );

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Messenger", href: "/huddle-ai" }, { label: "Meetings" }]}
          title={<>Meetings</>}
          description={<>Voice &amp; video calls with meeting chat.</>}
          actions={<><NewMeetingButton users={directory.map((u) => ({ _id: u._id, displayName: u.displayName }))} /></>}
        />
<PanelListFilters>
<div className="space-y-5">

        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
            <Clock className="size-3.5" /> Upcoming &amp; live
          </h2>
          {upcoming.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              Nothing scheduled. Start an instant meeting or schedule one.
            </p>
          ) : (
            upcoming.map(row)
          )}
        </section>

        {past.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase text-muted-foreground">Past</h2>
            {past.slice(0, 20).map(row)}
          </section>
        )}

        <p className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Architecture-ready.</strong> Meetings, invites, RSVP and meeting chat are
          fully wired. Live audio/video runs through a pluggable transport
          (<code className="rounded bg-muted px-1">src/lib/huddle-ai/meeting-transport.ts</code>) — today&apos;s local transport
          shows you your own camera; a WebRTC-mesh or SFU implementation drops in without touching the rest.
        </p>
      </div>
</PanelListFilters>
</div>
    </div>
  );
}
