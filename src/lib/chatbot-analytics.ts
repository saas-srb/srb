import "server-only";
import type { Collection, Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { CHAT_SESSIONS_COLLECTION, CHAT_MESSAGES_COLLECTION, type ChatSession, type ChatMessageDoc } from "@/lib/chatbot-sessions";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";
import { previousPeriodRange, computeGrowthPercent } from "@/lib/period-comparison";
import { countIdentifiedVisitors } from "@/lib/chat-visitors";

/** Sessions active within this window (from last activity) count as "live". */
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

async function sessionsCollection(): Promise<Collection<ChatSession>> {
  return (await getDb()).collection<ChatSession>(CHAT_SESSIONS_COLLECTION);
}
async function messagesCollection(): Promise<Collection<ChatMessageDoc>> {
  return (await getDb()).collection<ChatMessageDoc>(CHAT_MESSAGES_COLLECTION);
}

export interface ChatbotDashboardFilters {
  dateFrom?: Date;
  dateTo?: Date;
  granularity?: DashboardGranularity;
}

export interface PopularQuestion {
  question: string;
  count: number;
}

export interface ChatbotDashboardStats {
  totalSessions: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  activeSessions: number;
  uniqueVisitors: number;
  identifiedVisitors: number;
  avgConversationLength: number;
  avgResponseTimeMs: number;
  errorRate: number;
  flaggedCount: number;
  growth: {
    sessions: number | null;
    messages: number | null;
    visitors: number | null;
  };
  sessionsSeries: { date: string; count: number }[];
  messagesSeries: { date: string; count: number }[];
  popularQuestions: PopularQuestion[];
  deviceBreakdown: { label: string; value: number }[];
  sourcePages: { label: string; value: number }[];
}

function dateMatch(field: string, from?: Date, to?: Date): Record<string, unknown> {
  if (!from && !to) return {};
  const range: Record<string, Date> = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return { [field]: range };
}

function normalizeQuestion(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "").slice(0, 160);
}

export async function getChatbotDashboardStats(
  filters: ChatbotDashboardFilters = {}
): Promise<ChatbotDashboardStats> {
  const { dateFrom, dateTo } = filters;
  const granularity = filters.granularity ?? "day";
  const fmt = dateFormatFor(granularity);

  const sessions = await sessionsCollection();
  const messages = await messagesCollection();

  const sessionMatch = dateMatch("startedAt", dateFrom, dateTo);
  const messageMatch = dateMatch("createdAt", dateFrom, dateTo);

  const prev = previousPeriodRange(dateFrom, dateTo);
  const prevSessionMatch = prev ? dateMatch("startedAt", prev.from, prev.to) : null;
  const prevMessageMatch = prev ? dateMatch("createdAt", prev.from, prev.to) : null;

  interface SessionFacet extends Document {
    total: { count: number }[];
    visitors: { count: number }[];
    byBucket: { _id: string; count: number }[];
    byDevice: { _id: string; count: number }[];
    bySource: { _id: string | null; count: number }[];
  }

  const [sessionFacet] = await sessions
    .aggregate<SessionFacet>([
      { $match: sessionMatch },
      {
        $facet: {
          total: [{ $count: "count" }],
          visitors: [{ $group: { _id: "$visitorId" } }, { $count: "count" }],
          byBucket: [
            { $group: { _id: { $dateToString: { format: fmt, date: "$startedAt" } }, count: { $sum: 1 } } },
          ],
          byDevice: [{ $group: { _id: { $ifNull: ["$device", "unknown"] }, count: { $sum: 1 } } }],
          bySource: [{ $group: { _id: { $ifNull: ["$sourcePage", "(direct)"] }, count: { $sum: 1 } } }],
        },
      },
    ])
    .toArray();

  interface MessageFacet extends Document {
    total: { count: number }[];
    byRole: { _id: string; count: number }[];
    byBucket: { _id: string; count: number }[];
    responseTime: { avg: number | null }[];
    errors: { count: number }[];
    flagged: { count: number }[];
  }

  const [messageFacet] = await messages
    .aggregate<MessageFacet>([
      { $match: messageMatch },
      {
        $facet: {
          total: [{ $count: "count" }],
          byRole: [{ $group: { _id: "$role", count: { $sum: 1 } } }],
          byBucket: [
            { $group: { _id: { $dateToString: { format: fmt, date: "$createdAt" } }, count: { $sum: 1 } } },
          ],
          responseTime: [
            { $match: { role: "assistant", error: { $exists: false }, responseTimeMs: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: "$responseTimeMs" } } },
          ],
          errors: [{ $match: { role: "assistant", error: { $exists: true } } }, { $count: "count" }],
          flagged: [{ $match: { flaggedInjection: true } }, { $count: "count" }],
        },
      },
    ])
    .toArray();

  const popularRaw = await messages
    .aggregate<{ _id: string; count: number }>([
      { $match: { ...messageMatch, role: "user" } },
      {
        $group: {
          _id: {
            $toLower: {
              $trim: { input: "$content" },
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 40 },
    ])
    .toArray();

  const popularMap = new Map<string, PopularQuestion>();
  for (const row of popularRaw) {
    const key = normalizeQuestion(row._id);
    if (!key) continue;
    const existing = popularMap.get(key);
    if (existing) existing.count += row.count;
    else popularMap.set(key, { question: row._id.trim().slice(0, 160), count: row.count });
  }
  const popularQuestions = [...popularMap.values()].sort((a, b) => b.count - a.count).slice(0, 10);

  const [prevSessionCount, prevVisitorAgg, prevMessageCount] = await Promise.all([
    prevSessionMatch ? sessions.countDocuments(prevSessionMatch) : Promise.resolve(null),
    prevSessionMatch
      ? sessions.aggregate<{ count: number }>([
          { $match: prevSessionMatch },
          { $group: { _id: "$visitorId" } },
          { $count: "count" },
        ]).toArray()
      : Promise.resolve(null),
    prevMessageMatch ? messages.countDocuments(prevMessageMatch) : Promise.resolve(null),
  ]);

  const [activeSessions, identifiedVisitors] = await Promise.all([
    sessions.countDocuments({
      status: "active",
      lastActivityAt: { $gte: new Date(Date.now() - ACTIVE_WINDOW_MS) },
    }),
    countIdentifiedVisitors(dateFrom, dateTo),
  ]);

  const totalSessions = sessionFacet?.total?.[0]?.count ?? 0;
  const uniqueVisitors = sessionFacet?.visitors?.[0]?.count ?? 0;
  const totalMessages = messageFacet?.total?.[0]?.count ?? 0;
  const roleCounts = Object.fromEntries((messageFacet?.byRole ?? []).map((r) => [r._id, r.count]));
  const userMessages = roleCounts.user ?? 0;
  const assistantMessages = roleCounts.assistant ?? 0;
  const errorCount = messageFacet?.errors?.[0]?.count ?? 0;
  const flaggedCount = messageFacet?.flagged?.[0]?.count ?? 0;
  const avgResponseTimeMs = Math.round(messageFacet?.responseTime?.[0]?.avg ?? 0);

  const toSeries = (rows: { _id: string; count: number }[]) =>
    rows.map((r) => ({ date: r._id, count: r.count })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalSessions,
    totalMessages,
    userMessages,
    assistantMessages,
    activeSessions,
    uniqueVisitors,
    identifiedVisitors,
    avgConversationLength: totalSessions > 0 ? Math.round((totalMessages / totalSessions) * 10) / 10 : 0,
    avgResponseTimeMs,
    errorRate: assistantMessages > 0 ? Math.round((errorCount / assistantMessages) * 1000) / 10 : 0,
    flaggedCount,
    growth: {
      sessions: computeGrowthPercent(totalSessions, prevSessionCount),
      messages: computeGrowthPercent(totalMessages, prevMessageCount),
      visitors: computeGrowthPercent(
        uniqueVisitors,
        prevVisitorAgg ? (prevVisitorAgg[0]?.count ?? 0) : null
      ),
    },
    sessionsSeries: toSeries(sessionFacet?.byBucket ?? []),
    messagesSeries: toSeries(messageFacet?.byBucket ?? []),
    popularQuestions,
    deviceBreakdown: (sessionFacet?.byDevice ?? [])
      .map((d) => ({ label: d._id, value: d.count }))
      .sort((a, b) => b.value - a.value),
    sourcePages: (sessionFacet?.bySource ?? [])
      .map((s) => ({ label: s._id ?? "(direct)", value: s.count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
  };
}
