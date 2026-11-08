import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, PauseCircle, PlayCircle, Plus, SearchCheck, ShieldCheck, Wallet, MousePointerClick } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import EmptyState from "@/components/products/viralpulse-ai/shared/EmptyState";
import SourceBadge from "@/components/products/viralpulse-ai/shared/SourceBadge";
import PauseAllButton from "@/components/products/viralpulse-ai/ads/PauseAllButton";
import { PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { loadCampaignList } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";
import { LIST_STATUS_LABEL, formatMinor, type ListStatus } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { META_OBJECTIVES, META_OBJECTIVE_LABEL } from "@/lib/products/viralpulse-ai/ads-platforms/meta/constants";
import { formatDate, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TONE: Record<ListStatus, string> = {
  draft: "bg-muted text-muted-foreground", in_review: "bg-sky-500/10 text-sky-700 dark:text-sky-300", running: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  paused: "bg-amber-500/10 text-amber-800 dark:text-amber-300", ended: "bg-muted text-muted-foreground", failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};
const TABS: { key: "all" | ListStatus; label: string }[] = [{ key: "all", label: "All" }, { key: "draft", label: "Drafts" }, { key: "in_review", label: "In review" }, { key: "running", label: "Running" }, { key: "paused", label: "Paused" }, { key: "ended", label: "Ended" }, { key: "failed", label: "Failed" }];

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "VIEW_CAMPAIGNS")) redirect("/viralpulse-ai");
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? (sp.status as string) : "all";
  const r = await loadCampaignList({ q: sp.q, status, platform: sp.platform, objective: sp.objective, account: sp.account, from: sp.from, to: sp.to });
  const qs = (s: string) => { const p = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => Boolean(e[1]) && e[0] !== "status")); if (s !== "all") p.set("status", s); const t = p.toString(); return `/viralpulse-ai/campaigns${t ? `?${t}` : ""}`; };
  const s = r.stats;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Campaigns & Ads" }]}
        title="Campaigns & Ads"
        description="Plan, check, launch and track paid campaigns on Meta. Numbers on this page come from what Meta last reported to us; nothing is typed in by hand."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {can(viewer, "APPROVE_AD_SPEND") && s.running > 0 && <PauseAllButton running={s.running} />}
            {can(viewer, "APPROVE_AD_SPEND") && <Link href="/viralpulse-ai/campaigns/limits" className={buttonVariants({ variant: "outline", size: "sm" })}><ShieldCheck className="size-3.5" /> Spending limits</Link>}
            {can(viewer, "CREATE_CAMPAIGNS") && can(viewer, "CREATE_ADS") && <Link href="/viralpulse-ai/campaigns/new" className={buttonVariants({ size: "sm" })}><Plus className="size-3.5" /> New campaign</Link>}
          </div>
        }
        filters={
          <PanelFilterBar
            fields={[
              { key: "q", label: "Search", type: "search", placeholder: "Name, objective or offer" },
              { key: "platform", label: "Platform", type: "select", options: [{ value: "meta", label: "Meta (Facebook and Instagram)" }, { value: "other", label: "Other platforms" }], allLabel: "All platforms" },
              { key: "objective", label: "Objective", type: "select", options: META_OBJECTIVES.map((o) => ({ value: o, label: META_OBJECTIVE_LABEL[o] })), allLabel: "All objectives" },
              { key: "account", label: "Ad account", type: "select", options: r.accounts.map((a) => ({ value: a.id, label: a.name })), allLabel: "All ad accounts" },
              { key: "from", label: "Updated from", type: "date" },
              { key: "to", label: "Updated to", type: "date" },
            ]}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Running" value={s.running} accent icon={<PlayCircle className="size-4" />} />
        <KpiCard label="Paused" value={s.paused} icon={<PauseCircle className="size-4" />} />
        <KpiCard label="In review" value={s.inReview} icon={<SearchCheck className="size-4" />} />
        <KpiCard label="Spend this month" value={s.spendMonthMinor !== null && s.spendCurrency ? formatMinor(s.spendMonthMinor, s.spendCurrency) : <span className="text-base font-medium text-muted-foreground">Not synced yet</span>} icon={<Wallet className="size-4" />} />
        <KpiCard label="Link clicks this month" value={s.linkClicksMonth !== null ? Math.round(s.linkClicksMonth).toLocaleString("en-IN") : <span className="text-base font-medium text-muted-foreground">Not synced yet</span>} icon={<MousePointerClick className="size-4" />} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge source={s.lastSyncAt ? "synced" : "estimate"} at={s.lastSyncAt} label={s.lastSyncAt ? "Synced from Meta" : "Nothing synced from Meta yet"} />
        {!s.lastSyncAt && <span className="text-[11px] text-muted-foreground">Spend and clicks appear after a launched campaign has been synced.</span>}
      </div>

      <PanelTabs label="Campaign status" active={status} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: qs(t.key), count: r.counts[t.key] }))} />

      <GlassCard interactive={false}>
        <CardContent>
          {r.rows.length === 0 ? (
            <EmptyState icon={<Megaphone className="size-5" />} title={r.counts.all === 0 ? "No campaigns yet" : "Nothing matches these filters"}>
              {r.counts.all === 0 ? (can(viewer, "CREATE_CAMPAIGNS") ? "Create a campaign to plan it step by step, check it against Meta and launch it paused." : "Campaigns created by your team will appear here.") : "Change the filters or pick another tab."}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Platform</TableHead><TableHead>Status</TableHead><TableHead>Ad account</TableHead><TableHead className="text-right">Ads</TableHead><TableHead className="text-right">Daily budget</TableHead><TableHead>Dates</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
                <TableBody>
                  {r.rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-xs"><Link href={`/viralpulse-ai/campaigns/${c.id}`} className="font-medium hover:text-primary">{c.name}</Link><p className="truncate text-[11px] text-muted-foreground">{c.objective ? (META_OBJECTIVE_LABEL[c.objective as keyof typeof META_OBJECTIVE_LABEL] ?? c.objective) : "No objective yet"}</p></TableCell>
                      <TableCell><div className="flex flex-wrap gap-1">{c.platforms.map((p) => <PlatformChip key={p} platform={p} />)}</div></TableCell>
                      <TableCell><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[c.status]}`}>{LIST_STATUS_LABEL[c.status]}</span></TableCell>
                      <TableCell className="text-xs">{c.adAccount ?? <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.adCount}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{c.dailyMinor !== null && c.currency ? formatMinor(c.dailyMinor, c.currency) : "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{c.start ? `${formatDate(c.start)} - ${c.end ? formatDate(c.end) : "open"}` : "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(c.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
