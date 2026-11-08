import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import DashboardSection from "@/components/platform/panel/DashboardSection";
import Link from "next/link";
import { AudioLines, MessageSquare, Clock, Gauge, Activity, Users, Radio } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import VoiceDashboardFilters from "@/components/products/dealflow-ai/VoiceDashboardFilters";
import VoiceExportButton from "@/components/products/dealflow-ai/VoiceExportButton";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import GranularityToggle from "@/components/products/dealflow-ai/GranularityToggle";
import { getVoiceDashboardStats } from "@/lib/voice-analytics";
import { getVoiceSourcePages } from "@/lib/voice-conversations";
import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import type { DashboardGranularity } from "@/lib/granularity";
import { isElevenLabsConfigured } from "@/lib/elevenlabs";

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const VALID_GRANULARITIES: DashboardGranularity[] = ["day", "week", "month", "year"];

function fmtDuration(ms: number): number {
  return ms > 0 ? Math.max(1, Math.round(ms / 1000)) : 0;
}

export default async function VoiceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    dateFrom?: string;
    dateTo?: string;
    granularity?: string;
    device?: string;
    browser?: string;
    sourcePage?: string;
  }>;
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

  const [stats, sourcePages] = await Promise.all([
    getVoiceDashboardStats({
      dateFrom,
      dateTo,
      granularity,
      device: sp.device,
      browser: sp.browser,
      sourcePage: sp.sourcePage,
    }),
    getVoiceSourcePages(),
  ]);

  const hasActiveFilters = Boolean(sp.range || sp.dateFrom || sp.dateTo || sp.device || sp.browser || sp.sourcePage);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Workspace", href: "/commandos" },
          { label: "AI Chatbot", href: "/commandos/chatbot" },
          { label: "Conversation AI" },
        ]}
        title={<>Conversation AI</>}
        description={<>ElevenLabs voice mode — real-time speech analytics.</>}
        actions={<><div className="flex items-center gap-2">
          <Link href="/commandos/chatbot/voice-conversations" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Voice Conversations
          </Link>
          <VoiceExportButton
            params={{ dateFrom: dateFrom?.toISOString().slice(0, 10), dateTo: dateTo?.toISOString().slice(0, 10) }}
            endpoint="/api/commandos/chatbot/voice-conversations/export"
          />
        </div></>}
      />

      {!(await isElevenLabsConfigured()) && (
        <GlassCard interactive={false} className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-3 text-sm">
            <AudioLines className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">ElevenLabs isn&apos;t connected.</span> Add your key in Workspace → Settings → Integrations. Voice mode is
              offline. Connect it in CommandOS → Settings → Integrations, then enable voice in <span className="font-medium text-foreground">ElevenLabs Config</span>.
            </p>
          </CardContent>
        </GlassCard>
      )}

      <VoiceDashboardFilters
        range={rangeParam}
        dateFrom={(dateFrom ?? new Date()).toISOString().slice(0, 10)}
        dateTo={(dateTo ?? new Date()).toISOString().slice(0, 10)}
        device={sp.device ?? ""}
        browser={sp.browser ?? ""}
        sourcePage={sp.sourcePage ?? ""}
        sourcePages={sourcePages}
        hasActiveFilters={hasActiveFilters}
      />

      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Overview</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <KpiCard label="Voice Conversations" value={stats.totalConversations} accent trend={stats.growth.conversations} icon={<AudioLines className="size-4" />} />
          <KpiCard label="Voice Messages" value={stats.voiceMessages} trend={stats.growth.voiceMessages} icon={<MessageSquare className="size-4" />} />
          <KpiCard label="Avg. Call Duration" value={fmtDuration(stats.avgCallDurationMs)} suffix="s" icon={<Clock className="size-4" />} />
          <KpiCard label="Avg. Response Time" value={fmtDuration(stats.avgResponseTimeMs)} suffix="s" icon={<Gauge className="size-4" />} />
          <KpiCard label="Voice Share" value={stats.voiceSharePercent} suffix="%" icon={<Radio className="size-4" />} />
          <KpiCard label="Active Voice Now" value={stats.activeVoiceSessions} icon={<Activity className="size-4" />} />
        </div>
      </DashboardSection>

      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Trends</h2>
        <GlassCard>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Voice Conversations Over Time</CardTitle>
            <GranularityToggle value={granularity} />
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={stats.conversationsSeries} />
          </CardContent>
        </GlassCard>
      </DashboardSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader>
            <CardTitle>Voice vs Text Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart
              data={[
                { label: "Voice", value: stats.voiceMessages },
                { label: "Text", value: stats.textMessages },
              ]}
            />
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader>
            <CardTitle>Peak Usage Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={stats.peakHours.filter((_, i) => i % 2 === 0)} />
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader>
            <CardTitle>Conversation Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={stats.durationDistribution} />
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader>
            <CardTitle>Most Used Voices</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={stats.topVoices} />
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader>
            <CardTitle>By Device</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={stats.deviceBreakdown} />
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader>
            <CardTitle>By Browser</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={stats.browserBreakdown} />
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}
