import "server-only";
import type { Collection, Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { CHAT_MESSAGES_COLLECTION, type ChatMessageDoc } from "@/lib/chatbot-sessions";
import {
  VOICE_CONVERSATIONS_COLLECTION,
  VOICE_MESSAGES_COLLECTION,
  type VoiceConversation,
  type VoiceMessageDoc,
} from "@/lib/voice-conversations";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";
import { previousPeriodRange, computeGrowthPercent } from "@/lib/period-comparison";

const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

async function conversationsCol(): Promise<Collection<VoiceConversation>> {
  return (await getDb()).collection<VoiceConversation>(VOICE_CONVERSATIONS_COLLECTION);
}
async function voiceMessagesCol(): Promise<Collection<VoiceMessageDoc>> {
  return (await getDb()).collection<VoiceMessageDoc>(VOICE_MESSAGES_COLLECTION);
}
async function chatMessagesCol(): Promise<Collection<ChatMessageDoc>> {
  return (await getDb()).collection<ChatMessageDoc>(CHAT_MESSAGES_COLLECTION);
}

export interface VoiceDashboardFilters {
  dateFrom?: Date;
  dateTo?: Date;
  granularity?: DashboardGranularity;
  device?: string;
  browser?: string;
  sourcePage?: string;
}

export interface VoiceDashboardStats {
  totalConversations: number;
  voiceMessages: number;
  textMessages: number;
  voiceSharePercent: number;
  avgCallDurationMs: number;
  avgResponseTimeMs: number;
  activeVoiceSessions: number;
  uniqueVisitors: number;
  growth: { conversations: number | null; voiceMessages: number | null };
  conversationsSeries: { date: string; count: number }[];
  voiceVsTextSeries: { date: string; voice: number; text: number }[];
  peakHours: { label: string; value: number }[];
  durationDistribution: { label: string; value: number }[];
  topVoices: { label: string; value: number }[];
  deviceBreakdown: { label: string; value: number }[];
  browserBreakdown: { label: string; value: number }[];
}

function range(field: string, from?: Date, to?: Date): Record<string, unknown> {
  if (!from && !to) return {};
  const r: Record<string, Date> = {};
  if (from) r.$gte = from;
  if (to) r.$lte = to;
  return { [field]: r };
}

// [lower boundary → label]. Matches the $bucket boundaries below.
const DURATION_BUCKETS: { boundary: number; label: string }[] = [
  { boundary: 0, label: "< 30s" },
  { boundary: 30_000, label: "30–60s" },
  { boundary: 60_000, label: "1–2m" },
  { boundary: 120_000, label: "2–5m" },
  { boundary: 300_000, label: "5m+" },
];

export async function getVoiceDashboardStats(
  filters: VoiceDashboardFilters = {}
): Promise<VoiceDashboardStats> {
  const { dateFrom, dateTo } = filters;
  const fmt = dateFormatFor(filters.granularity ?? "day");
  const conversations = await conversationsCol();
  const voiceMessages = await voiceMessagesCol();
  const chatMessages = await chatMessagesCol();

  const convMatch: Record<string, unknown> = { ...range("startedAt", dateFrom, dateTo) };
  if (filters.device && filters.device !== "all") convMatch.device = filters.device;
  if (filters.browser && filters.browser !== "all") convMatch.browser = filters.browser;
  if (filters.sourcePage) convMatch.sourcePage = filters.sourcePage;

  const vmMatch = range("createdAt", dateFrom, dateTo);
  const prev = previousPeriodRange(dateFrom, dateTo);

  interface ConvFacet extends Document {
    total: { count: number }[];
    visitors: { count: number }[];
    avgDuration: { v: number | null }[];
    active: { count: number }[];
    byBucket: { _id: string; count: number }[];
    byDuration: { _id: number; count: number }[];
    byVoice: { _id: string | null; count: number }[];
    byDevice: { _id: string | null; count: number }[];
    byBrowser: { _id: string | null; count: number }[];
  }

  const [convFacet] = await conversations
    .aggregate<ConvFacet>([
      { $match: convMatch },
      {
        $facet: {
          total: [{ $count: "count" }],
          visitors: [{ $group: { _id: "$visitorId" } }, { $count: "count" }],
          avgDuration: [{ $group: { _id: null, v: { $avg: "$durationMs" } } }, { $project: { _id: 0, v: 1 } }],
          active: [
            {
              $match: {
                status: "active",
                lastActivityAt: { $gte: new Date(Date.now() - ACTIVE_WINDOW_MS) },
              },
            },
            { $count: "count" },
          ],
          byBucket: [
            { $group: { _id: { $dateToString: { format: fmt, date: "$startedAt" } }, count: { $sum: 1 } } },
          ],
          byDuration: [
            {
              $bucket: {
                groupBy: { $ifNull: ["$durationMs", 0] },
                boundaries: [0, 30_000, 60_000, 120_000, 300_000, 1e12],
                default: -1,
                output: { count: { $sum: 1 } },
              },
            },
          ],
          byVoice: [{ $group: { _id: "$voiceId", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }],
          byDevice: [{ $group: { _id: { $ifNull: ["$device", "unknown"] }, count: { $sum: 1 } } }],
          byBrowser: [{ $group: { _id: { $ifNull: ["$browser", "unknown"] }, count: { $sum: 1 } } }],
        },
      },
    ])
    .toArray();

  const [ttsAgg] = await voiceMessages
    .aggregate<{ v: number | null }>([
      { $match: { ...vmMatch, role: "assistant", ttsMs: { $gt: 0 } } },
      { $group: { _id: null, v: { $avg: "$ttsMs" } } },
    ])
    .toArray();

  const peakRaw = await voiceMessages
    .aggregate<{ _id: number; count: number }>([
      { $match: vmMatch },
      { $group: { _id: { $hour: { date: "$createdAt", timezone: "Asia/Kolkata" } }, count: { $sum: 1 } } },
    ])
    .toArray();

  const [voiceMsgCount, textMsgCount] = await Promise.all([
    chatMessages.countDocuments({ ...vmMatch, voice: true }),
    chatMessages.countDocuments({ ...vmMatch, voice: { $ne: true } }),
  ]);

  const vvtRaw = await chatMessages
    .aggregate<{ _id: string; voice: number; text: number }>([
      { $match: vmMatch },
      {
        $group: {
          _id: { $dateToString: { format: fmt, date: "$createdAt" } },
          voice: { $sum: { $cond: [{ $eq: ["$voice", true] }, 1, 0] } },
          text: { $sum: { $cond: [{ $eq: ["$voice", true] }, 0, 1] } },
        },
      },
    ])
    .toArray();

  const [prevConv, prevVoiceMsg] = await Promise.all([
    prev ? conversations.countDocuments({ ...convMatch, startedAt: { $gte: prev.from, $lte: prev.to } }) : Promise.resolve(null),
    prev
      ? chatMessages.countDocuments({ voice: true, createdAt: { $gte: prev.from, $lte: prev.to } })
      : Promise.resolve(null),
  ]);

  const totalConversations = convFacet?.total?.[0]?.count ?? 0;
  const totalMsgs = voiceMsgCount + textMsgCount;

  const peakHours = Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, "0")}:00`,
    value: peakRaw.find((r) => r._id === h)?.count ?? 0,
  }));

  const durationDistribution = DURATION_BUCKETS.map((b) => ({
    label: b.label,
    value: (convFacet?.byDuration ?? []).find((d) => d._id === b.boundary)?.count ?? 0,
  }));

  const toSeries = (rows: { _id: string; count: number }[]) =>
    rows.map((r) => ({ date: r._id, count: r.count })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalConversations,
    voiceMessages: voiceMsgCount,
    textMessages: textMsgCount,
    voiceSharePercent: totalMsgs > 0 ? Math.round((voiceMsgCount / totalMsgs) * 1000) / 10 : 0,
    avgCallDurationMs: Math.round(convFacet?.avgDuration?.[0]?.v ?? 0),
    avgResponseTimeMs: Math.round(ttsAgg?.v ?? 0),
    activeVoiceSessions: convFacet?.active?.[0]?.count ?? 0,
    uniqueVisitors: convFacet?.visitors?.[0]?.count ?? 0,
    growth: {
      conversations: computeGrowthPercent(totalConversations, prevConv),
      voiceMessages: computeGrowthPercent(voiceMsgCount, prevVoiceMsg),
    },
    conversationsSeries: toSeries(convFacet?.byBucket ?? []),
    voiceVsTextSeries: vvtRaw
      .map((r) => ({ date: r._id, voice: r.voice, text: r.text }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    peakHours,
    durationDistribution,
    topVoices: (convFacet?.byVoice ?? []).map((v) => ({ label: v._id ?? "unknown", value: v.count })),
    deviceBreakdown: (convFacet?.byDevice ?? [])
      .map((d) => ({ label: d._id ?? "unknown", value: d.count }))
      .sort((a, b) => b.value - a.value),
    browserBreakdown: (convFacet?.byBrowser ?? [])
      .map((d) => ({ label: d._id ?? "unknown", value: d.count }))
      .sort((a, b) => b.value - a.value),
  };
}
