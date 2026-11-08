"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { formatCell, type BlockColumn, type BlockRow } from "@/lib/products/databrain-ai/blocks";

/** Series colours: the repo's blue and coral first (as in the lead-status charts), then distinct accents. */
const COLORS = ["var(--brand-deep)", "var(--primary)", "#0ca30c", "#7c5cbf", "#d09a1c", "#2a9db8", "#d03b3b", "#6b7280"];
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const short = (v: unknown, n = 12) => {
  const s = String(v ?? "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

export default function ChartBlock({ chart, title, x, y, columns, rows }: { chart: "bar" | "line" | "pie" | "area"; title: string; x: string; y: string[]; columns: BlockColumn[]; rows: BlockRow[] }) {
  const col = (k: string) => columns.find((c) => c.key === k)!;
  const label = (k: string) => col(k)?.label ?? k;
  const fmt = (k: string, v: unknown) => formatCell(v as never, col(k) ?? { type: "number" });
  const money = y.some((k) => col(k)?.type === "money");
  const tick = (v: number) => (money ? `₹${compact.format(v)}` : compact.format(v));
  const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--popover-foreground)" };
  const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
  const data = rows.map((r) => ({ ...r, [x]: r[x] === null ? "—" : r[x] }));
  const summary = `${chart} chart: ${title}. ${rows.length} data point${rows.length === 1 ? "" : "s"}.`;

  return (
    <figure className="min-w-0 overflow-hidden rounded-xl border border-border/50 bg-background/60 p-3 dark:bg-card/40" aria-label={summary}>
      <figcaption className="mb-2 text-sm font-semibold text-foreground">{title}</figcaption>
      <div role="img" aria-label={summary} className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          {chart === "pie" ? (
            <PieChart>
              <Pie data={data} dataKey={y[0]} nameKey={x} outerRadius="75%" label={(p) => short((p as { name?: string }).name, 10)} labelLine={false} animationDuration={500}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(y[0], v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          ) : chart === "line" ? (
            <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => short(v)} interval="preserveStartEnd" />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={tick} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmt(String(n), v), label(String(n))]} />
              {y.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} formatter={(n) => label(String(n))} />}
              {y.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} animationDuration={500} />
              ))}
            </LineChart>
          ) : chart === "area" ? (
            <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => short(v)} interval="preserveStartEnd" />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={tick} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmt(String(n), v), label(String(n))]} />
              {y.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} formatter={(n) => label(String(n))} />}
              {y.map((k, i) => (
                <Area key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.18} strokeWidth={2} animationDuration={500} />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => short(v)} interval={0} angle={rows.length > 5 ? -20 : 0} textAnchor={rows.length > 5 ? "end" : "middle"} height={rows.length > 5 ? 56 : 30} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={tick} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} formatter={(v, n) => [fmt(String(n), v), label(String(n))]} />
              {y.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} formatter={(n) => label(String(n))} />}
              {y.map((k, i) => (
                <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[6, 6, 0, 0]} animationDuration={500} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {/* The same numbers for screen readers. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            {[x, ...y].map((k) => (
              <th key={k}>{label(k)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {[x, ...y].map((k) => (
                <td key={k}>{fmt(k, r[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
