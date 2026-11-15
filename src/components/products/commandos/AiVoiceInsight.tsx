import Link from "next/link";
import { MessageSquare, AudioLines, Clock, Users, Percent, Bot } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import { getChatbotDashboardStats } from "@/lib/chatbot-analytics";
import { getVoiceDashboardStats } from "@/lib/voice-analytics";
import { resolveDateRangePreset } from "@/lib/date-ranges";

/** Chat and voice conversations add up per day: one series for the combined view. */
export function mergeSeries(chat: { date: string; count: number }[], voice: { date: string; count: number }[]): { date: string; count: number }[] {
  const by = new Map<string, number>();
  for (const p of [...chat, ...voice]) by.set(p.date, (by.get(p.date) ?? 0) + p.count);
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

/**
 * ONE "AI & Voice" insight view: what the AI Chatbot Dashboard and the old Voice Dashboard showed, side by side for the last 30 days, so the
 * business reads chat and voice together. The chatbot's own Dashboard stays in the sidebar for the full chat detail.
 */
export default async function AiVoiceInsight() {
  const r = resolveDateRangePreset("last30")!;
  const [chat, voice] = await Promise.all([
    getChatbotDashboardStats({ dateFrom: r.from, dateTo: r.to, granularity: "day" }),
    getVoiceDashboardStats({ dateFrom: r.from, dateTo: r.to, granularity: "day" }),
  ]);
  const series = mergeSeries(chat.sessionsSeries, voice.conversationsSeries);
  const chatSec = chat.avgResponseTimeMs > 0 ? Math.max(1, Math.round(chat.avgResponseTimeMs / 1000)) : 0;
  const callSec = voice.avgCallDurationMs > 0 ? Math.max(1, Math.round(voice.avgCallDurationMs / 1000)) : 0;
  return (
    <section id="ai-voice" aria-label="AI and Voice" className="space-y-4 rounded-3xl border border-border/60 border-t-2 border-t-primary/60 bg-muted/70 p-5 shadow-sm sm:p-6 dark:bg-[color-mix(in_oklch,var(--background)_82%,black)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">AI &amp; Voice</h2>
          <p className="text-sm text-muted-foreground">Your website chatbot and voice assistant together, last 30 days.</p>
        </div>
        <Link href="/commandos/chatbot" className="text-sm font-medium text-primary hover:underline">Open the AI Chatbot Dashboard</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="All conversations" value={chat.totalSessions + voice.totalConversations} accent icon={<Bot className="size-4" />} />
        <KpiCard label="Chat conversations" value={chat.totalSessions} trend={chat.growth.sessions} icon={<MessageSquare className="size-4" />} />
        <KpiCard label="Voice conversations" value={voice.totalConversations} trend={voice.growth.conversations} icon={<AudioLines className="size-4" />} />
        <KpiCard label="Visitors who chatted" value={chat.uniqueVisitors} icon={<Users className="size-4" />} />
        <KpiCard label="Chat reply time" value={chatSec} suffix="s" icon={<Clock className="size-4" />} />
        <KpiCard label="Average call length" value={callSec} suffix="s" icon={<Percent className="size-4" />} />
      </div>
      <GlassCard interactive={false}>
        <CardHeader><CardTitle className="text-base">Conversations per day (chat and voice)</CardTitle></CardHeader>
        <CardContent><TimeSeriesChart data={series} /></CardContent>
      </GlassCard>
    </section>
  );
}
