import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import DashboardSection from "@/components/platform/panel/DashboardSection";
import Link from "next/link";
import { MessageSquare, Users, Activity, Bot, Clock, TriangleAlert, ShieldAlert, Gauge, UserCheck } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import ChatbotDashboardFilters from "@/components/products/dealflow-ai/ChatbotDashboardFilters";
import ChatbotExportButton from "@/components/products/dealflow-ai/ChatbotExportButton";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import GranularityToggle from "@/components/products/dealflow-ai/GranularityToggle";
import { getChatbotDashboardStats } from "@/lib/chatbot-analytics";
import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import type { DashboardGranularity } from "@/lib/granularity";
import { isOpenAIConfigured } from "@/lib/openai";
import { getChatbotConfig } from "@/lib/chatbot-config";

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const VALID_GRANULARITIES: DashboardGranularity[] = ["day", "week", "month", "year"];

export default async function ChatbotDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; dateFrom?: string; dateTo?: string; granularity?: string }>;
}) {
  const sp = await searchParams;

  const granularity: DashboardGranularity = VALID_GRANULARITIES.includes(sp.granularity as DashboardGranularity)
    ? (sp.granularity as DashboardGranularity)
    : "day";

  const rangeParam: DateRangePreset =
    sp.range && isValidDateRangePreset(sp.range)
      ? sp.range
      : sp.dateFrom || sp.dateTo
        ? "custom"
        : "last30";

  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;
  if (rangeParam === "custom") {
    dateFrom = parseDateParam(sp.dateFrom);
    dateTo = parseDateParam(sp.dateTo, true);
  } else {
    const resolved = resolveDateRangePreset(rangeParam)!;
    dateFrom = resolved.from;
    dateTo = resolved.to;
  }

  const [stats, config] = await Promise.all([
    getChatbotDashboardStats({ dateFrom, dateTo, granularity }),
    getChatbotConfig(),
  ]);

  const hasActiveFilters = Boolean(sp.range || sp.dateFrom || sp.dateTo);
  const exportParams = {
    dateFrom: dateFrom?.toISOString().slice(0, 10),
    dateTo: dateTo?.toISOString().slice(0, 10),
  };

  const avgRespSeconds = stats.avgResponseTimeMs > 0 ? Math.max(1, Math.round(stats.avgResponseTimeMs / 1000)) : 0;

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "AI Chatbot" }]}
        title={<>AI Chatbot</>}
        description={<>Public assistant analytics · model <span className="font-medium text-foreground">{config.model}</span></>}
        actions={<><div className="flex items-center gap-2">
          <Link href="/commandos/chatbot/conversations" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View Conversations
          </Link>
          <ChatbotExportButton params={exportParams} endpoint="/api/commandos/chatbot/conversations/export" />
        </div></>}
      />

      {!(await isOpenAIConfigured()) && (
        <GlassCard interactive={false} className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">OpenAI isn&apos;t connected.</span> Add your key in Workspace → Settings → Integrations. The public chatbot
              returns a friendly “unavailable” message until it is connected in CommandOS → Settings → Integrations.
            </p>
          </CardContent>
        </GlassCard>
      )}

      <ChatbotDashboardFilters
        range={rangeParam}
        dateFrom={(dateFrom ?? new Date()).toISOString().slice(0, 10)}
        dateTo={(dateTo ?? new Date()).toISOString().slice(0, 10)}
        hasActiveFilters={hasActiveFilters}
      />

      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Overview</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <KpiCard label="Chat Sessions" value={stats.totalSessions} accent trend={stats.growth.sessions} icon={<MessageSquare className="size-4" />} />
          <KpiCard label="Total Messages" value={stats.totalMessages} trend={stats.growth.messages} icon={<Bot className="size-4" />} />
          <KpiCard label="Active Now" value={stats.activeSessions} icon={<Activity className="size-4" />} />
          <KpiCard label="Unique Visitors" value={stats.uniqueVisitors} trend={stats.growth.visitors} icon={<Users className="size-4" />} />
          <KpiCard label="Identified Visitors" value={stats.identifiedVisitors} icon={<UserCheck className="size-4" />} />
          <KpiCard label="Avg. Msgs / Chat" value={stats.avgConversationLength} icon={<Gauge className="size-4" />} />
          <KpiCard label="Avg. Response" value={avgRespSeconds} suffix="s" icon={<Clock className="size-4" />} />
          <KpiCard label="Error Rate" value={stats.errorRate} suffix="%" icon={<TriangleAlert className="size-4" />} />
          <KpiCard label="Flagged" value={stats.flaggedCount} icon={<ShieldAlert className="size-4" />} />
        </div>
      </DashboardSection>

      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Trends</h2>
        <GlassCard>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Chat Sessions Over Time</CardTitle>
            <GranularityToggle value={granularity} />
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={stats.sessionsSeries} />
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader>
            <CardTitle>Messages Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={stats.messagesSeries} />
          </CardContent>
        </GlassCard>
      </DashboardSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader>
            <CardTitle>Sessions by Device</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={stats.deviceBreakdown} />
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader>
            <CardTitle>Top Source Pages</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={stats.sourcePages} />
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader>
          <CardTitle>Popular Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.popularQuestions.length === 0 && (
            <p className="text-sm text-muted-foreground">No questions in this range yet.</p>
          )}
          {stats.popularQuestions.map((q, i) => (
            <div
              key={`${q.question}-${i}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3 text-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <p className="truncate">{q.question}</p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {q.count}×
              </span>
            </div>
          ))}
        </CardContent>
      </GlassCard>
    </div>
  );
}
