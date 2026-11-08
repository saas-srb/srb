import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import Link from "next/link";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import { redirect } from "next/navigation";
import { Bot, Power, MessagesSquare, CalendarDays, Activity, Coins, Cpu, TriangleAlert, MessageSquarePlus } from "lucide-react";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import { PageHeader, SectionCard, Notice } from "@/components/products/agentos/AibotsUi";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/products/agentos/viewer";
import { GENERAL_BOT_ID } from "@/lib/products/agentos/constants";
import { getDashboard } from "@/lib/products/agentos/runs";
import { isOpenAIConfigured } from "@/lib/openai";
import { formatCompact, formatDateTime } from "@/lib/utils";

const usd = (n: number) => (n > 0 && n < 0.01 ? "< $0.01" : `$${n.toFixed(2)}`);

export default async function AibotsDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  const d = await getDashboard(viewer, { from: sp.from, to: sp.to });
  const mine = d.scope === "mine";
  const tokens = d.inputTokens30 + d.outputTokens30;

  return (
    <div className="space-y-4">
      <PanelDashboardHeader
        filters={<PanelFilterBar
          presets
          fields={[
            { key: "from", label: "From", type: "date" },
            { key: "to", label: "To", type: "date" },
          ]}
        />}
        title="AgentOS Overview"
        breadcrumbs={[{ label: "AgentOS", href: "/agentos" }, { label: "Dashboard" }]}
        description={mine ? "Track your bots, conversations and AI usage, with cost and reliability for the selected period." : "Monitor every bot, conversation and OpenAI execution across the company, with usage, cost and failure insights for the selected period."}
        actions={
          <Button nativeButton={false} render={<Link href={`/agentos/b/${GENERAL_BOT_ID}`} />}>
            <MessageSquarePlus className="size-4" /> Start New Chat
          </Button>
        }
      />

      {!(await isOpenAIConfigured()) && (
        <Notice tone="warn">
          OpenAI isn&apos;t connected for this workspace (Settings → Integrations), so bots can be set up but can&apos;t answer or index knowledge files yet.
        </Notice>
      )}

      <KpiGrid>
        <KpiCard label={mine ? "My Bots" : "Total Bots"} value={d.totalBots} accent icon={<Bot className="size-4" />} />
        <KpiCard label="Active Bots" value={d.activeBots} icon={<Power className="size-4" />} />
        <KpiCard label={mine ? "My Chats" : "Total Chats"} value={d.totalChats} icon={<MessagesSquare className="size-4" />} />
        <KpiCard label="Chats Today" value={d.chatsToday} icon={<CalendarDays className="size-4" />} />
        <KpiCard label="AI Executions (30d)" value={d.runs30} icon={<Activity className="size-4" />} />
        <KpiCard label="Tokens (30d)" value={formatCompact(tokens)} icon={<Cpu className="size-4" />} />
        <KpiCard label="Est. AI Cost (30d)" value={usd(d.cost30)} icon={<Coins className="size-4" />} />
        <KpiCard label="Failed Executions (30d)" value={d.failed30} icon={<TriangleAlert className="size-4" />} tone={d.failed30 > 0 ? "down" : undefined} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2" title="AI usage" description={`Executions per day · ${formatCompact(d.inputTokens30)} input / ${formatCompact(d.outputTokens30)} output tokens`}>
          <TimeSeriesChart data={d.daily.map((x) => ({ date: x.date.slice(5), count: x.runs }))} />
        </SectionCard>
        <SectionCard title="Most used bots" description="By executions, last 30 days">
          {d.topBots.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No bot has been used yet.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {d.topBots.map((b) => (
                <li key={b.botId} className="flex items-center gap-3 py-2">
                  <BotAvatar icon={b.icon} color={b.color} imageUrl={b.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatCompact(b.tokens)} tokens · {usd(b.cost)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{b.runs}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Recent chats" description={mine ? "Your latest conversations" : "Latest conversations across all users"}>
          {d.recentChats.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No chats yet.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {d.recentChats.map((c) => (
                <li key={c._id} className="py-2">
                  <Link href={c.userEmail === viewer.email ? `/agentos/b/${c.botId}/${c._id}` : `/agentos/chats/${c._id}`} className="block hover:text-primary">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {c.botName} · {mine ? "" : `${c.userEmail} · `}
                      {formatDateTime(c.lastMessageAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Failed executions" description="Latest OpenAI errors">
          {d.recentFailures.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No failures. 🎉</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {d.recentFailures.map((f, i) => (
                <li key={i} className="py-2">
                  <p className="text-sm font-medium">
                    {f.botName} <span className="text-xs font-normal text-muted-foreground">· {f.model}</span>
                  </p>
                  <p className="line-clamp-2 text-[11px] text-rose-600 dark:text-rose-400">{f.error ?? "Unknown error"}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDateTime(f.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <p className="text-[11px] text-muted-foreground">Cost is an estimate from the per-model prices in AgentOS settings, not an OpenAI invoice.</p>
    </div>
  );
}
