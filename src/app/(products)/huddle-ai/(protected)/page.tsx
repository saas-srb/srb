import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import {
  Users,
  UserCheck,
  Hash,
  MessagesSquare,
  Send,
  FolderOpen,
  FolderKanban,
  MailWarning,
} from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import MessengerDashboardFilters from "@/components/products/huddle-ai/MessengerDashboardFilters";
import Link from "next/link";
import { CalendarClock, Video as VideoIcon } from "lucide-react";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { getMessengerDashboardStats } from "@/lib/products/huddle-ai/dashboard";
import { listMeetingsForUser } from "@/lib/products/huddle-ai/meetings";
import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";

export const dynamic = "force-dynamic";

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function MessengerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentChatUser();
  if (!user) return null;

  const rangeParam: DateRangePreset =
    sp.range && isValidDateRangePreset(sp.range) ? sp.range : sp.dateFrom || sp.dateTo ? "custom" : "last30";

  let from: Date;
  let to: Date;
  if (rangeParam === "custom") {
    to = parseDateParam(sp.dateTo, true) ?? new Date();
    from = parseDateParam(sp.dateFrom) ?? new Date(to.getTime() - 30 * 86400000);
  } else {
    const resolved = resolveDateRangePreset(rangeParam)!;
    from = resolved.from;
    to = resolved.to;
  }

  const [stats, upcomingMeetings] = await Promise.all([
    getMessengerDashboardStats({ from, to, viewerId: user.id }),
    listMeetingsForUser(user.id, "upcoming"),
  ]);
  const hasActiveFilters = Boolean(sp.range || sp.dateFrom || sp.dateTo);

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative space-y-4">
        <PanelDashboardHeader
          breadcrumbs={[{ label: "Messenger", href: "/huddle-ai" }, { label: "Chat Dashboard" }]}
          title="Team Communication Overview"
          description={<>Welcome back, {user.displayName.split(" ")[0]}. Follow conversations, channels, meetings and team activity at a glance.</>}
          filters={<MessengerDashboardFilters
                  range={rangeParam}
                  dateFrom={from.toISOString().slice(0, 10)}
                  dateTo={to.toISOString().slice(0, 10)}
                  hasActiveFilters={hasActiveFilters}
                />}
        />

        {upcomingMeetings.length > 0 && (
          <GlassCard interactive={false}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4" />
                Upcoming meetings
              </CardTitle>
              <Link href="/huddle-ai/meetings" className="text-xs font-medium text-primary hover:underline">
                All meetings →
              </Link>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {upcomingMeetings.slice(0, 4).map((m) => (
                <div key={m._id} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <VideoIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.status === "live" ? "Live now" : new Date(m.startAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}
                      {" · "}
                      {m.hostName}
                    </p>
                  </div>
                  <Link
                    href={`/huddle-ai/meetings/${m._id}`}
                    className="shrink-0 rounded-lg bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                  >
                    {m.status === "live" ? "Join" : "Open"}
                  </Link>
                </div>
              ))}
            </CardContent>
          </GlassCard>
        )}

        <KpiGrid>
          <KpiCard label="Active Users" value={stats.kpis.activeUsers} icon={<Users className="size-4" />} />
          <KpiCard label="Online Members" value={stats.kpis.onlineMembers} accent icon={<UserCheck className="size-4" />} />
          <KpiCard label="Total Channels" value={stats.kpis.totalChannels} icon={<Hash className="size-4" />} />
          <KpiCard label="Direct Messages Today" value={stats.kpis.directMessagesToday} icon={<MessagesSquare className="size-4" />} />
          <KpiCard label="Messages Sent Today" value={stats.kpis.messagesSentToday} accent icon={<Send className="size-4" />} />
          <KpiCard label="Shared Files" value={stats.kpis.sharedFiles} icon={<FolderOpen className="size-4" />} />
          <KpiCard label="Active Project Channels" value={stats.kpis.activeProjectChannels} icon={<FolderKanban className="size-4" />} />
          <KpiCard
            label="Unread Messages"
            value={stats.kpis.unreadMessages}
            tone={stats.kpis.unreadMessages > 0 ? "down" : undefined}
            icon={<MailWarning className="size-4" />}
          />
        </KpiGrid>

        <GlassCard>
          <CardHeader>
            <CardTitle>Daily Messaging Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={stats.dailyMessagingTrend} />
          </CardContent>
        </GlassCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader>
              <CardTitle>Channel Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryBarChart data={stats.channelActivity} />
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader>
              <CardTitle>Most Active Members</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryBarChart data={stats.mostActiveMembers} />
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader>
              <CardTitle>Online vs Offline Users</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryBarChart data={stats.onlineVsOffline} />
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader>
              <CardTitle>File Sharing Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryBarChart data={stats.fileSharing} />
            </CardContent>
          </GlassCard>
        </div>

        <GlassCard>
          <CardHeader>
            <CardTitle>Peak Communication Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={stats.peakHours} />
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}
