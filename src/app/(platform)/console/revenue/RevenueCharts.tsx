"use client";

import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/platform/billing/types";

/**
 * Revenue charts. Colours are chart tokens scoped to `.rev-viz` (validated
 * categorical slots, light + dark stepped separately): one series = slot 1;
 * MRR movements = new (blue) / expansion (aqua) / contraction (violet) /
 * churn (red); billed (blue) vs collected (orange). Every chart has a table view on the page for the exact values.
 */

const VIZ_STYLE = `
.rev-viz { --viz-1:#2a78d6; --viz-2:#eb6834; --viz-aqua:#1baf7a; --viz-violet:#4a3aa7; --viz-red:#e34948; --viz-grid:#e1e0d9; --viz-axis:#c3c2b7; --viz-muted:#898781; }
.dark .rev-viz { --viz-1:#3987e5; --viz-2:#d95926; --viz-aqua:#199e70; --viz-violet:#9085e9; --viz-red:#e66767; --viz-grid:#2c2c2a; --viz-axis:#383835; --viz-muted:#898781; }
`;

export interface ChartMonth {
  label: string;
  mrr: number;
  new: number;
  expansion: number;
  contraction: number;
  churn: number;
  net: number;
  billed: number;
  invoicesIssued: number;
  collected: number;
  collectedTax: number;
  invoicesPaid: number;
}

const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });
const tickMoney = (paise: number) => compact.format(paise / 100);
const shortLabel = (label: string) => label.replace(/ (\d{2})(\d{2})$/, " ’$2");

const AXIS = { tick: { fontSize: 11, fill: "var(--viz-muted)" }, tickLine: false, axisLine: false } as const;

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="rev-viz">
      <style>{VIZ_STYLE}</style>
      {children}
    </div>
  );
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; swatch?: string; strong?: boolean }[] }) {
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-semibold">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 tabular-nums">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.swatch && <span className="inline-block size-2 rounded-sm" style={{ background: r.swatch }} />}
            {r.label}
          </span>
          <span className={r.strong ? "font-semibold" : undefined}>{r.value}</span>
        </p>
      ))}
    </div>
  );
}

type TipProps = { active?: boolean; payload?: readonly { payload?: unknown }[] };
const pointOf = (p: TipProps) => (p.active && p.payload?.length ? (p.payload[0].payload as ChartMonth) : null);

export function EmptyChart({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 px-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

export function MrrTrendChart({ data }: { data: ChartMonth[] }) {
  return (
    <Frame>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" tickFormatter={shortLabel} minTickGap={16} {...AXIS} />
          <YAxis tickFormatter={tickMoney} width={56} {...AXIS} />
          <Tooltip
            cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
            content={(p: TipProps) => {
              const d = pointOf(p);
              return d ? <TooltipBox title={d.label} rows={[{ label: "MRR", value: formatMoney(d.mrr), swatch: "var(--viz-1)", strong: true }]} /> : null;
            }}
          />
          <Area
            type="monotone"
            dataKey="mrr"
            stroke="var(--viz-1)"
            strokeWidth={2}
            fill="var(--viz-1)"
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, fill: "var(--viz-1)", stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Frame>
  );
}

const MOVES = [
  { key: "new", label: "New", color: "var(--viz-1)", sign: 1 },
  { key: "expansion", label: "Expansion", color: "var(--viz-aqua)", sign: 1 },
  { key: "contraction", label: "Contraction", color: "var(--viz-violet)", sign: -1 },
  { key: "churn", label: "Churn", color: "var(--viz-red)", sign: -1 },
] as const;

export function MovementsChart({ data }: { data: ChartMonth[] }) {
  const rows = data.map((d) => ({ ...d, contractionNeg: -d.contraction, churnNeg: -d.churn }));
  return (
    <Frame>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {MOVES.map((m) => (
          <li key={m.key} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: m.color }} />
            {m.label}
            {m.sign < 0 && " (−)"}
          </li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={236}>
        <BarChart data={rows} stackOffset="sign" margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" tickFormatter={shortLabel} minTickGap={16} {...AXIS} />
          <YAxis tickFormatter={tickMoney} width={56} {...AXIS} />
          <ReferenceLine y={0} stroke="var(--viz-axis)" />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={(p: TipProps) => {
              const d = pointOf(p);
              if (!d) return null;
              return (
                <TooltipBox
                  title={d.label}
                  rows={[
                    ...MOVES.map((m) => ({ label: m.label, value: `${m.sign < 0 && d[m.key] > 0 ? "−" : ""}${formatMoney(d[m.key])}`, swatch: m.color })),
                    { label: "Net new MRR", value: `${d.net < 0 ? "−" : ""}${formatMoney(Math.abs(d.net))}`, strong: true },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="new" stackId="m" fill="var(--viz-1)" stroke="var(--card)" strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="expansion" stackId="m" fill="var(--viz-aqua)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="contractionNeg" stackId="m" fill="var(--viz-violet)" stroke="var(--card)" strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="churnNeg" stackId="m" fill="var(--viz-red)" stroke="var(--card)" strokeWidth={1} radius={[0, 0, 4, 4]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}

const CASH = [
  { key: "billed", label: "Billed", color: "var(--viz-1)" },
  { key: "collected", label: "Collected", color: "var(--viz-2)" },
] as const;

/** Invoices issued vs payments received per month (both tax-inclusive). */
export function BilledCollectedChart({ data }: { data: ChartMonth[] }) {
  return (
    <Frame>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {CASH.map((m) => (
          <li key={m.key} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: m.color }} />
            {m.label}
          </li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={236}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barCategoryGap="25%" barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" tickFormatter={shortLabel} minTickGap={16} {...AXIS} />
          <YAxis tickFormatter={tickMoney} width={56} {...AXIS} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={(p: TipProps) => {
              const d = pointOf(p);
              return d ? (
                <TooltipBox
                  title={d.label}
                  rows={[
                    { label: `Billed (${d.invoicesIssued} invoice${d.invoicesIssued === 1 ? "" : "s"})`, value: formatMoney(d.billed), swatch: "var(--viz-1)" },
                    { label: `Collected (${d.invoicesPaid} paid)`, value: formatMoney(d.collected), swatch: "var(--viz-2)", strong: true },
                    { label: "GST collected", value: formatMoney(d.collectedTax) },
                  ]}
                />
              ) : null;
            }}
          />
          <Bar dataKey="billed" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          <Bar dataKey="collected" fill="var(--viz-2)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}
