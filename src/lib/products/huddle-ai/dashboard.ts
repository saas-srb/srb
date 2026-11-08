import "server-only";
import { countActiveUsers } from "@/lib/products/huddle-ai/users";
import { countOnline } from "@/lib/products/huddle-ai/presence";
import { countChannels, countActiveProjectChannels } from "@/lib/products/huddle-ai/channels";
import {
  countMessagesBetween,
  countDirectMessagesBetween,
  dailyMessageTrend,
  peakHours,
  channelActivity,
  mostActiveUsers,
} from "@/lib/products/huddle-ai/messages";
import { countSharedFiles, fileSharingBreakdown } from "@/lib/products/huddle-ai/attachments";
import { totalUnreadForUser } from "@/lib/products/huddle-ai/notifications";

/**
 * Chat Dashboard aggregations. All analytics honour the dashboard date range;
 * the KPI "today" tiles are always relative to the current day. Mirrors the
 * shape of `src/lib/spendiq/dashboard.ts`.
 */

export interface MessengerDashboardStats {
  kpis: {
    activeUsers: number;
    onlineMembers: number;
    totalChannels: number;
    directMessagesToday: number;
    messagesSentToday: number;
    sharedFiles: number;
    activeProjectChannels: number;
    unreadMessages: number;
  };
  dailyMessagingTrend: { date: string; count: number }[];
  channelActivity: { label: string; value: number }[];
  mostActiveMembers: { label: string; value: number }[];
  onlineVsOffline: { label: string; value: number }[];
  fileSharing: { label: string; value: number }[];
  peakHours: { label: string; value: number }[];
}

export interface DashboardParams {
  from: Date;
  to: Date;
  viewerId: string;
}

export async function getMessengerDashboardStats(params: DashboardParams): Promise<MessengerDashboardStats> {
  const { from, to, viewerId } = params;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const now = new Date();

  const [
    activeUsers,
    onlineMembers,
    totalChannels,
    directMessagesToday,
    messagesSentToday,
    sharedFiles,
    activeProjectChannels,
    unreadMessages,
    trend,
    channels,
    members,
    fileMix,
    hours,
  ] = await Promise.all([
    countActiveUsers(),
    countOnline(),
    countChannels(),
    countDirectMessagesBetween(startOfToday, now),
    countMessagesBetween(startOfToday, now),
    countSharedFiles(from, to),
    countActiveProjectChannels(),
    totalUnreadForUser(viewerId),
    dailyMessageTrend(from, to),
    channelActivity(from, to),
    mostActiveUsers(from, to),
    fileSharingBreakdown(from, to),
    peakHours(from, to),
  ]);

  return {
    kpis: {
      activeUsers,
      onlineMembers,
      totalChannels,
      directMessagesToday,
      messagesSentToday,
      sharedFiles,
      activeProjectChannels,
      unreadMessages,
    },
    dailyMessagingTrend: trend,
    channelActivity: channels.map((c) => ({ label: c.label, value: c.value })),
    mostActiveMembers: members,
    onlineVsOffline: [
      { label: "Online", value: onlineMembers },
      { label: "Offline", value: Math.max(activeUsers - onlineMembers, 0) },
    ],
    fileSharing: fileMix,
    peakHours: hours,
  };
}
