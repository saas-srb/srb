"use client";

import "@/components/products/commandos/usage/usage-viz.css";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Info, RotateCcw, Save, TrendingDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { GITHUB_ACTIONS, IMAGE_PRICES, OPENAI_MODELS, VERCEL_REGIONS, type PriceRow } from "@/lib/platform/costs/catalog";
import { DEFAULT_SETTINGS, computePlans, inr, sanitizeSettings, type CostSettings, type Health, type PlanCostRow, type PlanInputForCost } from "@/lib/platform/costs/model";
import type { ActualCosts } from "@/lib/platform/costs/store";
import { applyRecommendedPriceAction, saveCostSettingsAction } from "./actions";

const HEALTH: Record<Health, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  loss: { label: "Loses money", cls: "border-red-500/50 text-red-700 dark:text-red-400", icon: TrendingDown },
  thin: { label: "Thin — loses if fully used", cls: "border-amber-500/50 text-amber-700 dark:text-amber-400", icon: AlertTriangle },
  healthy: { label: "Covered", cls: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 },
  free: { label: "Free plan", cls: "border-border text-muted-foreground", icon: Info },
  custom: { label: "Custom price", cls: "border-border text-muted-foreground", icon: Info },
};

const nf = (n: number, dp = 0) => n.toLocaleString("en-IN", { maximumFractionDigits: dp, minimumFractionDigits: dp });
const SERIES = [
  { key: "ai", label: "AI", color: "var(--viz-1)" },
  { key: "storage", label: "Storage", color: "var(--viz-2)" },
  { key: "emails", label: "Email", color: "#1baf7a" },
  { key: "voice", label: "Voice", color: "#e87ba4" },
] as const;

function Num({ label, value, onChange, step = 1, min = 0, max, suffix, hint }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string; hint?: string }) {
  return (
    <label className="block text-xs">
      <span className="font-medium">{label}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <Input type="number" inputMode="decimal" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} className="h-8 text-xs tabular-nums" />
        {suffix && <span className="shrink-0 text-muted-foreground">{suffix}</span>}
      </span>
      {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Card({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function CostCalculator({ initial, plans, actual, priceList, asOf, saved, savedAt, canManage }: { initial: CostSettings; plans: PlanInputForCost[]; actual: ActualCosts; priceList: PriceRow[]; asOf: string; saved: boolean; savedAt: string | null; canManage: boolean }) {
  const [s, setS] = useState<CostSettings>(initial);
  const [baseline, setBaseline] = useState<string>(JSON.stringify(sanitizeSettings(initial)));
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<{ row: PlanCostRow; kind: "recommended" | "safe" } | null>(null);
  const dirty = JSON.stringify(sanitizeSettings(s)) !== baseline;
  const set = (patch: Partial<CostSettings>) => setS((p) => ({ ...p, ...patch }));

  const { rows, unit, free } = useMemo(() => computePlans(plans, sanitizeSettings(s)), [plans, s]);
  // The same plans priced as the business grows: shared bills and the free companies' cost are split over more paying companies, so prices fall.
  const SIZES = [10, 25, 50, 100, 250, 500];
  const sensitivity = useMemo(() => {
    const clean = sanitizeSettings(s);
    const ratio = clean.expectedFreeCompanies / Math.max(1, clean.expectedPayingCompanies);
    return SIZES.map((n) => ({ n, rows: computePlans(plans, { ...clean, expectedPayingCompanies: n, expectedFreeCompanies: Math.round(n * ratio) }).rows }));
  }, [plans, s]);
  const paid = rows.filter((r) => r.health !== "free" && r.health !== "custom");
  const mixTotal = s.aiMix.reduce((a, m) => a + m.pct, 0);

  function save() {
    start(async () => {
      const res = await saveCostSettingsAction(s);
      if (res.ok) { toast.success(res.message); setBaseline(JSON.stringify(sanitizeSettings(s))); } else toast.error(res.error);
    });
  }
  function apply() {
    if (!confirm) return;
    const { row, kind } = confirm;
    start(async () => {
      const res = await applyRecommendedPriceAction(row.plan.id, kind);
      if (res.ok) toast.success(res.message); else toast.error(res.error);
      setConfirm(null);
    });
  }

  const chart = rows.filter((r) => r.health !== "custom").flatMap((r) => [
    { name: `${r.plan.name} · typical`, ai: round(r.typical.ai), storage: round(r.typical.storage), emails: round(r.typical.emails), voice: round(r.typical.voice) },
    { name: `${r.plan.name} · full use`, ai: round(r.worst.ai), storage: round(r.worst.storage), emails: round(r.worst.emails), voice: round(r.worst.voice) },
  ]);

  const fullSafe = paid.length > 0 && paid.every((r) => r.leftWorst >= 0);
  const worstPlans = paid.filter((r) => r.leftWorst < 0).map((r) => r.plan.name);
  const [mode, setMode] = useState<Mode>("full");
  const [tab, setTab] = useState("overview");

  return (
    <div className="usage-viz space-y-4">
      {dirty && canManage && (
        <div role="status" className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/50 bg-card/95 p-3 text-xs shadow-md backdrop-blur">
          <span className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" />You changed assumptions. The numbers below already follow them; save to keep them and to be able to apply prices.</span>
          <span className="flex gap-2"><Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setS(JSON.parse(baseline))} disabled={pending}>Undo</Button><Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={save} disabled={pending}><Save className="size-3.5" />Save assumptions</Button></span>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">1 · Overview</TabsTrigger>
          <TabsTrigger value="plans">2 · Prices &amp; limits</TabsTrigger>
          <TabsTrigger value="free">3 · Free plan &amp; one-time costs</TabsTrigger>
          <TabsTrigger value="actual">4 · This month (real)</TabsTrigger>
          <TabsTrigger value="assumptions">5 · Assumptions{dirty && <span className="ml-1 size-1.5 rounded-full bg-amber-500" aria-label="unsaved" />}</TabsTrigger>
          <TabsTrigger value="prices">6 · Official prices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div role="status" className={`flex items-start gap-3 rounded-2xl border p-4 ${fullSafe ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
            {fullSafe ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />}
            <div className="text-sm">
              <p className="font-semibold">{fullSafe ? "Your paid plans are safe — SelfRun does not lose money on any of them." : `${worstPlans.join(", ")} can lose money.`}</p>
              <p className="mt-0.5 text-muted-foreground">
                {fullSafe
                  ? <>Even a company that uses <b>every</b> limit of a paid plan costs less than it pays: after the payment fee, its share of the shared bills ({inr(unit.fixedMonthlyInr)} a month) and the cost of free companies, something is still left over for profit and maintenance.</>
                  : <>At today's price and limits, a company using everything costs more than it pays. Open “2 · Prices &amp; limits” to see the price that fixes it, or the limits that stay profitable at today's price.</>}
                {" "}The free plan itself costs {inr(free.worst, 0)} a month per company if used fully ({inr(free.typical, 0)} at usual use).
              </p>
            </div>
          </div>

          <details className="rounded-2xl border border-border/70 bg-card p-4 text-xs">
            <summary className="cursor-pointer text-sm font-semibold">How to read this page (30 seconds)</summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li><b className="text-foreground">Price</b> is what a company pays you each month, before GST (GST is the government's, not yours).</li>
              <li><b className="text-foreground">Costs</b> are what <i>you</i> pay other companies for that customer: OpenAI for AI, Vercel for files, Resend for email, ElevenLabs for voice, Razorpay for taking the payment — plus a share of the bills that exist whether or not anyone uses the product (hosting, database, app stores).</li>
              <li><b className="text-foreground">Full use</b> = the company uses every limit of its plan to the last unit (the worst month you can ever have). <b className="text-foreground">Usual use</b> = it uses only the share set in “5 · Assumptions” — this is a guess until real use replaces it.</li>
              <li><b className="text-foreground">Left over</b> is what remains after all costs. It pays for your profit and for maintenance. Green = you keep money, red = you lose.</li>
              <li>Every provider price comes from their own official page (tab 6, with links). Everything you can change is in tab 5.</li>
            </ul>
          </details>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Shared bills every month" value={inr(unit.fixedMonthlyInr)} sub={`${s.fixedItems.filter((f) => f.on).length} bills switched on · $${nf(unit.usd(unit.fixedMonthlyInr), 0)} · paid whether or not anyone uses the product`} />
            <Stat label="One free company costs" value={`${inr(free.typical, 1)} / month`} sub={`up to ${inr(free.worst, 1)} if it uses every limit`} />
            <Stat label="Payment fee on every payment" value={`${nf(unit.gatewayShare * 100, 2)}%`} sub={`${s.gatewayPct}% + ${s.subscriptionFeePct}% subscription fee + ${s.gatewayGstPct}% GST on that fee`} />
            <Stat label="One sign-up website (AI)" value={inr(unit.websiteOnce, 1)} sub={`one time per company · ${nf(s.websiteTokens)} tokens + ${s.websiteImages} photos`} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">What each plan leaves you, per company per month</h2>
            <div className="inline-flex rounded-lg border border-border/70 bg-card p-0.5 text-xs" role="group" aria-label="Which use to show">
              {([["full", "If they use everything"], ["typical", "At usual use"]] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${mode === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => <PlanCard key={r.plan.id} r={r} mode={mode} />)}
          </div>
        </TabsContent>

        <TabsContent value="plans" className="mt-4 space-y-5">
      {/* plans */}
      <Card title="Cost of every plan, and the price that covers it" hint="Per company per month. “Typical” = a company using the share of each limit set below; “full use” = every limit used to the last unit. Recommended = covers typical use + its share of shared bills with your small buffer; Safe = covers full use too.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-xs">
            <thead><tr className="text-left text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Plan</th><th className="py-1.5 pr-3 text-right font-medium">Companies</th><th className="py-1.5 pr-3 text-right font-medium">Price now</th>
              <th className="py-1.5 pr-3 text-right font-medium">Typical cost</th><th className="py-1.5 pr-3 text-right font-medium">Full-use cost</th><th className="py-1.5 pr-3 text-right font-medium">Left per company (typical / full)</th>
              <th className="py-1.5 pr-3 text-right font-medium">Break-even</th><th className="py-1.5 pr-3 text-right font-medium">Recommended</th><th className="py-1.5 pr-3 text-right font-medium">Safe</th><th className="py-1.5 font-medium">Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const h = HEALTH[r.health]; const Icon = h.icon;
                const priced = r.health !== "free" && r.health !== "custom";
                return (
                  <tr key={r.plan.id} className="border-t border-border/50 align-top tabular-nums">
                    <td className="py-2 pr-3 font-medium">{r.plan.name}{r.safeLimits && <span className="mt-0.5 block max-w-[17rem] text-[11px] font-normal text-amber-700 dark:text-amber-400">A company using every limit costs {inr(r.worst.total)} — more than this price pays for. Limits that stay profitable at this price: AI {r.safeLimits.ai === null ? "—" : nf(r.safeLimits.ai)} tokens · {r.safeLimits.storageMb === null ? "—" : nf(r.safeLimits.storageMb)} MB · {r.safeLimits.emails === null ? "—" : nf(r.safeLimits.emails)} emails · {r.safeLimits.voice === null ? "—" : nf(r.safeLimits.voice)} voice min.</span>}{r.unlimited.length > 0 && <span className="mt-0.5 block text-[11px] font-normal text-amber-700 dark:text-amber-400">Unlimited {r.unlimited.join(", ").toLowerCase()} can't be costed — set a limit</span>}</td>
                    <td className="py-2 pr-3 text-right">{nf(r.plan.companies)}</td>
                    <td className="py-2 pr-3 text-right">{r.health === "custom" ? "Custom" : r.currentPrice === 0 ? "Free" : inr(r.currentPrice)}</td>
                    <td className="py-2 pr-3 text-right">{inr(r.typical.total, 1)}</td>
                    <td className="py-2 pr-3 text-right">{inr(r.worst.total, 1)}</td>
                    <td className="py-2 pr-3 text-right">{priced ? <><span className={r.leftTypical < 0 ? "font-semibold text-red-700 dark:text-red-400" : ""}>{inr(r.leftTypical, 0)}</span> / <span className={r.leftWorst < 0 ? "font-semibold text-red-700 dark:text-red-400" : ""}>{inr(r.leftWorst, 0)}</span>{r.marginTypicalPct !== null && <span className="block text-[11px] text-muted-foreground">{nf(r.marginTypicalPct, 0)}% margin typical</span>}</> : "—"}</td>
                    <td className="py-2 pr-3 text-right">{priced ? inr(Math.ceil(r.breakEven)) : "—"}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{priced ? inr(r.recommended) : "—"}{priced && r.recommended !== r.currentPrice && <span className={`block text-[11px] font-normal ${r.recommended > r.currentPrice ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>{r.recommended > r.currentPrice ? `+${inr(r.recommended - r.currentPrice)}` : `−${inr(r.currentPrice - r.recommended)}`} vs now</span>}</td>
                    <td className="py-2 pr-3 text-right">{priced ? inr(r.safe) : "—"}</td>
                    <td className="py-2"><Badge variant="outline" className={`gap-1 text-[10px] ${h.cls}`}><Icon className="size-3" />{h.label}</Badge>
                      {priced && canManage && (
                        <span className="mt-1.5 flex gap-1.5">
                          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={dirty || pending || r.recommended === r.currentPrice} title={dirty ? "Save the assumptions first" : undefined} onClick={() => setConfirm({ row: r, kind: "recommended" })}>Use recommended</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={dirty || pending || r.safe === r.currentPrice} onClick={() => setConfirm({ row: r, kind: "safe" })}>Use safe</Button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {paid.length > 0 && (paid.every((r) => r.leftWorst >= 0) ? (
          <p role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /><span><b>Every paid plan is safe.</b> Even a company that uses every limit to the last unit costs less than its price pays for (after the gateway fee, its share of the shared bills and the free companies). The prices on sale are set at the <b>Safe</b> level, not the lower <b>Recommended</b> one, so no customer can ever cost you money.</span></p>
        ) : (
          <p role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /><span><b>{paid.filter((r) => r.leftWorst < 0).map((r) => r.plan.name).join(", ")}</b> would lose money if a company used every limit. Raise the price to its Safe value, or lower the limits shown under the plan name.</span></p>
        ))}
        <p className="mt-2 text-xs text-muted-foreground">Prices are monthly, before GST. Yearly prices move by the same proportion when you apply a suggestion. Each applied price becomes a new price version: companies already subscribed keep what they bought.</p>
      </Card>

      {/* chart */}
      <Card title="Where each plan's cost comes from" hint="Rupees per company per month, by service — typical use next to full use.">
        <div role="img" aria-label="Stacked bars of cost per plan by service">
          <ResponsiveContainer width="100%" height={Math.max(220, chart.length * 34 + 60)}>
            <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap={6}>
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.6} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${v}`} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} formatter={(v) => inr(Number(v), 2)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {SERIES.map((x, i) => <Bar key={x.key} dataKey={x.key} name={x.label} stackId="c" fill={x.color} stroke="var(--card)" strokeWidth={2} radius={i === SERIES.length - 1 ? [0, 4, 4, 0] : 0} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="How the price falls as you grow" hint="Recommended monthly price (before GST) if you had this many paying companies — the shared bills and the free companies' cost are split over more of them. Free companies are kept in the same proportion as above.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs tabular-nums">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1.5 pr-3 font-medium">Plan</th><th className="py-1.5 pr-3 text-right font-medium">Price now</th>{sensitivity.map((c) => <th key={c.n} className="py-1.5 pr-3 text-right font-medium">{nf(c.n)} paying</th>)}</tr></thead>
            <tbody>{paid.map((r) => (
              <tr key={r.plan.id} className="border-t border-border/40"><td className="py-1.5 pr-3 font-medium">{r.plan.name}</td><td className="py-1.5 pr-3 text-right">{inr(r.currentPrice)}</td>
                {sensitivity.map((c) => { const x = c.rows.find((y) => y.plan.id === r.plan.id); const v = x?.recommended ?? 0; return <td key={c.n} className={`py-1.5 pr-3 text-right ${v <= r.currentPrice ? "font-semibold text-emerald-700 dark:text-emerald-400" : ""}`}>{inr(v)}</td>; })}</tr>))}</tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Green = today's price already covers it at that size. Until you reach that many paying companies, keep today's price or accept a small shortfall.</p>
      </Card>

        </TabsContent>

        <TabsContent value="free" className="mt-4 space-y-5">
        {/* free plan + break-even */}
        <Card title="The free plan and break-even" hint="Free companies are paid for by the paying ones — this shows how much.">
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <Fact label="One free company, typical month" value={inr(free.typical, 2)} />
            <Fact label="One free company, every limit used" value={inr(free.worst, 2)} />
            <Fact label="Sign-up website (once per company)" value={inr(unit.websiteOnce, 2)} note={`${nf(s.websiteTokens)} tokens + ${s.websiteImages} photos`} />
            <Fact label="Apps build for a company (all 5 platforms)" value={inr(unit.appBuildOnce, 0)} note={`${nf(unit.appBuildMinutes)} runner minutes at ${s.buildMinutesPerJob} min per job · GitHub's ${nf(GITHUB_ACTIONS.freeMinutes.free)} free minutes a month cover ${nf(Math.floor(GITHUB_ACTIONS.freeMinutes.free / Math.max(1, unit.appBuildMinutes)))} builds`} />
            <Fact label={`${nf(s.expectedFreeCompanies)} free companies cost`} value={`${inr(free.typical * s.expectedFreeCompanies)} / month`} />
            <Fact label="Added to each paying company" value={s.spreadFreeCost ? `${inr(free.subsidyPerPaying, 1)} / month` : "not added"} />
            <Fact label="Shared bills added to each paying company" value={s.spreadFixedCost ? `${inr(unit.fixedMonthlyInr / Math.max(1, s.expectedPayingCompanies), 1)} / month` : "not added"} />
          </dl>
          {paid.length > 0 && (
            <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-3 text-xs">
              <p className="mb-1 font-medium">Paying companies needed to cover everything at today's prices (typical use)</p>
              <ul className="space-y-0.5">
                {paid.map((r) => {
                  const perCompany = r.currentPrice - r.gatewayAtCurrent - r.typical.total;
                  const need = perCompany > 0 ? Math.ceil((unit.fixedMonthlyInr + free.typical * s.expectedFreeCompanies) / perCompany) : null;
                  return <li key={r.plan.id} className="flex justify-between gap-2"><span>{r.plan.name} <span className="text-muted-foreground">(contributes {inr(perCompany, 0)} each)</span></span><span className="font-semibold tabular-nums">{need === null ? "never — price below cost" : `${nf(need)} companies`}</span></li>;
                })}
              </ul>
            </div>
          )}
        </Card>

        </TabsContent>

        <TabsContent value="actual" className="mt-4 space-y-5">
        {/* actual */}
        <Card title={`Actual so far this month (${actual.period})`} hint="From the real usage of every company, priced with the official rates below. Use it to check the assumptions.">
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <Fact label="AI (OpenAI)" value={inr(actual.ai.totalInr, 1)} note={`${nf(actual.ai.tokens)} tokens · ${nf(actual.ai.calls)} requests · ${nf(actual.ai.images)} images`} />
            <Fact label="Emails" value={inr(actual.emails.inr, 1)} note={`${nf(actual.emails.count)} sent`} />
            <Fact label="Voice" value={inr(actual.voice.inr, 1)} note={`${nf(actual.voice.minutes, 1)} minutes`} />
            <Fact label="Files (storage + downloads)" value={inr(actual.storage.inr, 1)} note={`${nf(actual.storage.gb, 3)} GB held`} />
            <Fact label="Variable total so far" value={inr(actual.totalInr, 1)} note={`${nf(actual.companies.total)} companies (${nf(actual.companies.free)} free, ${nf(actual.companies.paying)} paid)`} />
            <Fact label="Plus shared bills" value={inr(actual.totalInr + unit.fixedMonthlyInr, 0)} note="everything the platform pays this month, estimated" />
          </dl>
          {actual.ai.byModel.length > 0 && (
            <table className="mt-3 w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">AI model</th><th className="py-1 text-right font-medium">Requests</th><th className="py-1 text-right font-medium">Tokens</th><th className="py-1 text-right font-medium">Cost</th></tr></thead>
              <tbody>{actual.ai.byModel.map((m) => <tr key={m.model} className="border-t border-border/40 tabular-nums"><td className="py-1 font-medium">{m.model}{!m.known && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(blended rate)</span>}</td><td className="py-1 text-right">{nf(m.calls)}</td><td className="py-1 text-right">{nf(m.tokens)}</td><td className="py-1 text-right font-semibold">{inr(m.inr, 2)}</td></tr>)}</tbody></table>
          )}
          <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3 text-xs">
            <p className="mb-1.5 font-medium">Replace assumptions with what real use shows</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" disabled={!canManage || actual.measured.inputSharePct === null} onClick={() => actual.measured.inputSharePct !== null && set({ inputSharePct: actual.measured.inputSharePct })}>Input share {actual.measured.inputSharePct === null ? "(not enough use yet)" : `${actual.measured.inputSharePct}%`}</Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" disabled={!canManage || !actual.measured.aiMix} onClick={() => actual.measured.aiMix && set({ aiMix: actual.measured.aiMix })}>Model mix {actual.measured.aiMix ? actual.measured.aiMix.map((m) => `${m.model} ${m.pct}%`).join(" · ") : "(not enough use yet)"}</Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" disabled={!canManage || !actual.measured.utilization} onClick={() => actual.measured.utilization && set({ utilization: actual.measured.utilization })}>Limits used by paying companies {actual.measured.utilization ? `AI ${actual.measured.utilization.ai}% · files ${actual.measured.utilization.storage}% · email ${actual.measured.utilization.emails}% · voice ${actual.measured.utilization.voice}%` : "(no paying company yet)"}</Button>
            </div>
          </div>
          {actual.ai.byCompany.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">Heaviest AI users: {actual.ai.byCompany.slice(0, 3).map((c) => `${c.name} (${nf(c.tokens)} tokens)`).join(" · ")}</p>}
        </Card>
        </TabsContent>

        <TabsContent value="assumptions" className="mt-4 space-y-5">
      {/* assumptions */}
      <Card title="Assumptions" hint={`${saved && savedAt ? `Saved ${new Date(savedAt).toLocaleString("en-IN")}. ` : "Not saved yet. "}Provider prices come from the catalogue below and can't be edited here; everything on this card is YOUR decision or your own measurement.`}
        right={canManage ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setS(DEFAULT_SETTINGS)} disabled={pending}><RotateCcw className="size-3.5" />Reset</Button>
            <Button type="button" size="sm" className="h-8 gap-1 text-xs" onClick={save} disabled={pending || !dirty}><Save className="size-3.5" />{dirty ? "Save assumptions" : "Saved"}</Button>
          </div>
        ) : <Badge variant="outline" className="text-[10px]">View only</Badge>}>
        <fieldset disabled={!canManage || pending} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Num label="Rupees per US dollar" value={s.fxRate} step={0.1} min={1} onChange={(n) => set({ fxRate: n })} hint="Check today's rate: providers bill in dollars." />
            <Num label="Profit + maintenance buffer" value={s.marginPct} step={1} max={60} suffix="% of price" onChange={(n) => set({ marginPct: n })} hint="Keep it small." />
            <label className="block text-xs"><span className="font-medium">Vercel region the app runs in</span>
              <select value={s.vercelRegion} onChange={(e) => set({ vercelRegion: e.target.value })} className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs">{Object.values(VERCEL_REGIONS).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">Vercel prices files and data transfer by region.</span></label>
            <Num label="Razorpay subscription fee" value={s.subscriptionFeePct} step={0.01} max={5} suffix="%" onChange={(n) => set({ subscriptionFeePct: n })} hint="0.99% on top of the 2% for recurring payments." />
            <Num label="Gateway fee" value={s.gatewayPct} step={0.1} max={10} suffix="%" onChange={(n) => set({ gatewayPct: n })} hint="Razorpay: 2% domestic, up to 3% international." />
            <Num label="GST (on the plan price)" value={s.gstPct} step={1} max={40} suffix="%" onChange={(n) => set({ gstPct: n })} />
            <Num label="Round suggestions up to" value={s.roundToInr} step={1} min={1} suffix="₹ multiple" onChange={(n) => set({ roundToInr: n })} />
            <Num label="Paying companies you plan for" value={s.expectedPayingCompanies} min={1} onChange={(n) => set({ expectedPayingCompanies: n })} hint="Shared bills are divided over these." />
            <Num label="Free companies you expect" value={s.expectedFreeCompanies} min={0} onChange={(n) => set({ expectedFreeCompanies: n })} />
            <div className="space-y-1.5 text-xs">
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.spreadFixedCost} onChange={(e) => set({ spreadFixedCost: e.target.checked })} />Add shared bills to each plan's cost</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.spreadFreeCost} onChange={(e) => set({ spreadFreeCost: e.target.checked })} />Add the free companies' cost to paid plans</label>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold">How much of each limit a typical company uses</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Num label="AI tokens" value={s.utilization.ai} max={100} suffix="%" onChange={(n) => set({ utilization: { ...s.utilization, ai: n } })} />
              <Num label="File storage" value={s.utilization.storage} max={100} suffix="%" onChange={(n) => set({ utilization: { ...s.utilization, storage: n } })} />
              <Num label="Emails" value={s.utilization.emails} max={100} suffix="%" onChange={(n) => set({ utilization: { ...s.utilization, emails: n } })} />
              <Num label="Voice minutes" value={s.utilization.voice} max={100} suffix="%" onChange={(n) => set({ utilization: { ...s.utilization, voice: n } })} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold">AI: which models, and how the tokens split</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {OPENAI_MODELS.map((m) => {
                const cur = s.aiMix.find((x) => x.model === m.id)?.pct ?? 0;
                return <Num key={m.id} label={m.label} value={cur} max={100} suffix="%" onChange={(n) => set({ aiMix: [...s.aiMix.filter((x) => x.model !== m.id), { model: m.id, pct: n }].filter((x) => x.pct > 0 || x.model === m.id) })} hint={`$${m.input} in · $${m.output} out`} />;
              })}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Num label="Input (prompt) share of tokens" value={s.inputSharePct} max={100} suffix="%" onChange={(n) => set({ inputSharePct: n })} />
              <Num label="…of which served from cache" value={s.cachedSharePct} max={100} suffix="%" onChange={(n) => set({ cachedSharePct: n })} />
              <p className={`self-end text-[11px] ${mixTotal === 100 ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"}`}>Model shares add up to {nf(mixTotal)}%{mixTotal === 100 ? "" : " — they are scaled to 100% in the calculation"}.</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold">Files, voice and the sign-up website</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Num label="Files downloaded per month" value={s.egressFactor} step={0.05} suffix="× their size" onChange={(n) => set({ egressFactor: n })} hint="Your assumption — Vercel Blob Insights shows the real figure." />
              <Num label="AI tokens that use file search" value={s.fileSearchSharePct} max={100} suffix="%" onChange={(n) => set({ fileSearchSharePct: n })} hint="Chatbot and AgentOS answers; $2.50 per 1,000 searches." />
              <Num label="Vector stores, all companies" value={s.vectorStoreGb} step={0.1} suffix="GB" onChange={(n) => set({ vectorStoreGb: n })} hint="First 1 GB is free; $0.10 per GB per day after." />
              <Num label="App build: minutes per job" value={s.buildMinutesPerJob} max={75} onChange={(n) => set({ buildMinutesPerJob: n })} hint="The workflow caps a job at 75 minutes; use your real build time." />
              <Num label="Voice: characters spoken per minute" value={s.speechCharsPerMinute} step={50} min={100} onChange={(n) => set({ speechCharsPerMinute: n })} hint="About 150 words a minute ≈ 900." />
              <Num label="Voice: share of the minute the visitor speaks" value={s.visitorSpeakPct} max={100} suffix="%" onChange={(n) => set({ visitorSpeakPct: n })} />
              <Num label="Sign-up website: AI tokens" value={s.websiteTokens} step={10000} onChange={(n) => set({ websiteTokens: n })} />
              <Num label="Sign-up website: photos" value={s.websiteImages} max={20} onChange={(n) => set({ websiteImages: n })} />
              <label className="block text-xs"><span className="font-medium">Photo model</span>
                <select value={s.websiteImageModel} onChange={(e) => set({ websiteImageModel: e.target.value })} className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs">{Object.entries(IMAGE_PRICES).map(([id, m]) => <option key={id} value={id}>{m.label} (${m.low[2]} low)</option>)}</select></label>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold">Shared bills you pay every month (US dollars)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {s.fixedItems.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg border border-border/60 p-2 text-xs">
                  <input type="checkbox" checked={f.on} aria-label={`Include ${f.label}`} onChange={(e) => set({ fixedItems: s.fixedItems.map((x) => (x.id === f.id ? { ...x, on: e.target.checked } : x)) })} />
                  <div className="min-w-0 flex-1"><p className="truncate font-medium" title={f.label}>{f.label}</p><p className="truncate text-[11px] text-muted-foreground" title={f.note}>{f.note}</p></div>
                  <Input type="number" value={f.usdPerMonth} min={0} step={0.5} className="h-8 w-24 text-xs tabular-nums" aria-label={`${f.label} dollars per month`} onChange={(e) => set({ fixedItems: s.fixedItems.map((x) => (x.id === f.id ? { ...x, usdPerMonth: Number(e.target.value) } : x)) })} />
                </div>
              ))}
            </div>
          </div>
        </fieldset>
      </Card>

        </TabsContent>

        <TabsContent value="prices" className="mt-4 space-y-5">
      {/* price list */}
      <Card title="Official prices used" hint={`Copied from each provider's own pricing page on ${asOf}. “Check” marks a figure the page didn't state outright. Providers change prices — re-read the linked page before a big decision.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1.5 pr-3 font-medium">Provider</th><th className="py-1.5 pr-3 font-medium">What</th><th className="py-1.5 pr-3 font-medium">Price</th><th className="py-1.5 font-medium">Source</th></tr></thead>
            <tbody>{priceList.map((p, i) => (
              <tr key={i} className="border-t border-border/40 align-top">
                <td className="py-1.5 pr-3 font-medium">{p.provider}</td>
                <td className="py-1.5 pr-3">{p.item}</td>
                <td className="py-1.5 pr-3 tabular-nums">{p.price}{p.note && <span className="block text-[11px] text-muted-foreground">{p.note}</span>}</td>
                <td className="py-1.5"><a href={p.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Open<ExternalLink className="size-3" /></a>{!p.verified && <Badge variant="outline" className="ml-1.5 border-amber-500/50 text-[9px] text-amber-700 dark:text-amber-400">Check</Badge>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Card>

      <Card title="How a price is worked out">
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li><b className="text-foreground">Usage cost</b> = each limit × the share a typical company uses × the provider's price (AI by token, files by MB kept and downloaded, email by message, voice by minute spoken and heard).</li>
          <li><b className="text-foreground">Shared bills</b> (hosting, database, app-store fees…) are divided over the paying companies you expect, and the free companies' cost is spread the same way.</li>
          <li><b className="text-foreground">Gateway fee</b>: Razorpay takes {s.gatewayPct}% + {s.subscriptionFeePct}% for recurring payments, + {s.gatewayGstPct}% GST on the fee from what the customer pays including GST — about <b className="text-foreground">{nf(unit.gatewayShare * 100, 2)}%</b> of the price before GST.</li>
          <li><b className="text-foreground">Recommended price</b> = (usage + shared + free share) ÷ (1 − gateway − {s.marginPct}% buffer), rounded up to a multiple of ₹{s.roundToInr}. <b className="text-foreground">Safe</b> does the same for a company that uses every limit fully.</li>
          <li>GST you collect is not income and is left out. GST paid on provider invoices (including GST on foreign services) is not credited here — claim it if you are registered, and your real margin will be a little better.</li>
        </ol>
      </Card>

        </TabsContent>
      </Tabs>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change {confirm?.row.plan.name}'s price?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && <>Monthly price goes from {inr(confirm.row.currentPrice)} to <b>{inr(confirm.kind === "safe" ? confirm.row.safe : confirm.row.recommended)}</b> (before GST); other billing cycles move by the same proportion. It becomes a new price version for new subscriptions — companies already subscribed ({nf(confirm.row.plan.companies)}) keep what they bought.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={apply} disabled={pending}>{pending ? "Applying…" : "Apply price"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;


// ── plain-language views ────────────────────────────────────────────────────

type Mode = "full" | "typical";

const FLOW = [
  { key: "gateway", label: "Payment fee (Razorpay)", color: "#8a8f98", help: "What Razorpay keeps from every payment." },
  { key: "ai", label: "AI (OpenAI)", color: "var(--viz-1)", help: "Tokens the company uses." },
  { key: "storage", label: "Files (Vercel Blob)", color: "var(--viz-2)", help: "Keeping files and sending them out." },
  { key: "emails", label: "Email (Resend)", color: "#1baf7a", help: "Emails the platform sends for the company." },
  { key: "voice", label: "Voice (ElevenLabs)", color: "#e87ba4", help: "Voice assistant minutes." },
  { key: "shared", label: "Share of shared bills", color: "#6250d6", help: "Hosting, database, app-store fees … divided over the paying companies you plan for." },
  { key: "free", label: "Share of free companies' cost", color: "#c98500", help: "Free companies cost money too; paying companies carry it." },
] as const;

function flowOf(r: PlanCostRow, mode: Mode) {
  const c = mode === "full" ? r.worst : r.typical;
  const parts = { gateway: r.gatewayAtCurrent, ai: c.ai, storage: c.storage, emails: c.emails, voice: c.voice, shared: r.fixedShare, free: r.freeShare };
  const spent = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, spent, left: r.currentPrice - spent };
}

/** Where one month's payment goes, as a bar that always adds up to the price. */
function RupeeFlow({ row, mode }: { row: PlanCostRow; mode: Mode }) {
  const { parts, spent, left } = flowOf(row, mode);
  const price = Math.max(row.currentPrice, 1);
  const over = left < 0;
  const total = over ? spent : price;
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Where ${inr(row.currentPrice)} goes: ${FLOW.map((f) => `${f.label} ${inr(parts[f.key])}`).join(", ")}, left ${inr(left)}`}>
        {FLOW.map((f) => parts[f.key] > 0 && <div key={f.key} title={`${f.label}: ${inr(parts[f.key], 1)}`} style={{ width: `${(parts[f.key] / total) * 100}%`, background: f.color, borderRight: "2px solid var(--card)" }} />)}
        {!over && left > 0 && <div title={`Left: ${inr(left, 1)}`} style={{ width: `${(left / total) * 100}%`, background: "var(--viz-good)" }} />}
      </div>
      <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-2">
        {FLOW.map((f) => parts[f.key] > 0 && (
          <li key={f.key} className="flex items-center justify-between gap-2" title={f.help}>
            <span className="flex min-w-0 items-center gap-1.5"><i className="inline-block size-2 shrink-0 rounded-sm" style={{ background: f.color }} /><span className="truncate text-muted-foreground">{f.label}</span></span>
            <span className="tabular-nums">{inr(parts[f.key], 1)}</span>
          </li>
        ))}
        <li className={`col-span-full mt-1 flex items-center justify-between gap-2 border-t border-border/50 pt-1 font-semibold ${over ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
          <span>{over ? "Short by" : "Left over (profit + maintenance)"}</span><span className="tabular-nums">{inr(Math.abs(left), 1)}</span>
        </li>
      </ul>
    </div>
  );
}

function PlanCard({ r, mode }: { r: PlanCostRow; mode: Mode }) {
  const h = HEALTH[r.health];
  const Icon = h.icon;
  const priced = r.health !== "free" && r.health !== "custom";
  const l = r.plan.limits;
  const limitLine = [
    l.seats !== null ? `${nf(l.seats)} ${l.seats === 1 ? "person" : "people"}` : "unlimited people",
    l.aiTokensPerMonth !== null ? `${nf(l.aiTokensPerMonth)} AI tokens` : "unlimited AI",
    l.storageMb !== null ? `${l.storageMb >= 1024 ? nf(l.storageMb / 1024, 1) + " GB" : nf(l.storageMb) + " MB"} files` : "unlimited files",
    l.emailsPerMonth !== null ? `${nf(l.emailsPerMonth)} emails` : "unlimited email",
    l.voiceMinutesPerMonth !== null ? `${nf(l.voiceMinutesPerMonth)} voice min` : "unlimited voice",
  ].join(" · ");
  const flow = flowOf(r, mode);
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{r.plan.name}</h3>
          <p className="text-xs text-muted-foreground">{r.health === "custom" ? "Custom price" : r.currentPrice === 0 ? "Free" : `${inr(r.currentPrice)} per month, before GST`}{r.plan.companies > 0 ? ` · ${nf(r.plan.companies)} ${r.plan.companies === 1 ? "company" : "companies"}` : ""}</p>
        </div>
        <Badge variant="outline" className={`shrink-0 gap-1 text-[10px] ${h.cls}`}><Icon className="size-3" />{h.label}</Badge>
      </header>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{limitLine}</p>
      {priced ? (
        <>
          <p className="text-sm">
            If a company {mode === "full" ? "uses every limit to the last unit" : "uses the usual share of its limits"}, you keep{" "}
            <b className={flow.left < 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}>{inr(flow.left, 0)}</b> of its {inr(r.currentPrice)} every month.
          </p>
          <RupeeFlow row={r} mode={mode} />
        </>
      ) : r.health === "free" ? (
        <p className="text-sm">One free company costs you <b>{inr(mode === "full" ? r.worst.total : r.typical.total, 1)}</b> a month {mode === "full" ? "if it uses everything" : "at usual use"}. Nobody pays for it directly — the paying plans carry it (see “Free plan & one-time costs”).</p>
      ) : (
        <p className="text-sm text-muted-foreground">Enterprise is priced per deal. Its limits would cost you about {inr(mode === "full" ? r.worst.total : r.typical.total, 0)} a month {mode === "full" ? "at full use" : "at usual use"} — quote above that plus your buffer.</p>
      )}
    </article>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>{note && <dd className="text-[11px] text-muted-foreground">{note}</dd>}</div>
  );
}
