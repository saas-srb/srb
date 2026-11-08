"use client";

import FilterCardShell from "@/components/platform/panel/FilterCardShell";
import React, { useState } from "react";
import {
  Clock, CheckCircle2, AlertCircle, Building2, FolderKanban,
  BarChart2, Coins, AlertTriangle, Filter, PieChart as PieIcon,
  TrendingUp, TrendingDown, Activity, Target, Layers, Users,
  BarChart3, LineChart as LineChartIcon, Zap,
} from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import GroupedBarChart from "@/components/products/sprintos/GroupedBarChart";
import StatusPieChart, { type StatusPieDatum } from "@/components/products/dealflow-ai/StatusPieChart";
import ProjectBillingDownloadButtons from "@/components/products/sprintos/ProjectBillingDownloadButtons";
import { formatMoney } from "@/lib/products/spendiq/constants";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie, AreaChart, Area,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, ZAxis, Line, ReferenceLine, ComposedChart,
} from "recharts";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
export interface AnalyticsProjectRow {
  _id: string;
  projectCode: string;
  name: string;
  clientName: string;
  clientId: string;
  estimatedHours: number;
  actualHours: number;
  billableHours: number;
  nonBillableHours: number;
  estimatedBudget: number;
  currency: string;
  status: string;
  category?: string | null;
  milestoneCount?: number;
  completedMilestones?: number;
  teamSize?: number;
  priority?: string;
  progressPercent?: number;
}

export interface Props {
  projects: AnalyticsProjectRow[];
  clients: { _id: string; companyName: string }[];
}

// ──────────────────────────────────────────────
// Color palettes
// ──────────────────────────────────────────────
const STATUS_PIE_COLORS: Record<string, string> = {
  active: "#10b981",
  completed: "#3b82f6",
  on_hold: "#f59e0b",
  planning: "#8b5cf6",
  overrun: "#ef4444",
  in_progress: "var(--primary)",
  testing: "#06b6d4",
  review: "#f472b6",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#10b981",
  backlog: "#94a3b8",
};

const CHART_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "var(--primary)", "#06b6d4"];

// ──────────────────────────────────────────────
// Shared tooltip style
// ──────────────────────────────────────────────
const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

// ──────────────────────────────────────────────
// Section heading component
// ──────────────────────────────────────────────
function SectionHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Budget Utilization Bar Chart
// ──────────────────────────────────────────────
function BudgetUtilizationChart({ data }: { data: { label: string; budget: number; spent: number }[] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={56} interval={0} />
        <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`₹${(Number(v) || 0).toLocaleString()}`, ""]} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
        <Bar dataKey="budget" name="Contract Budget" fill="#6366f1" radius={[4, 4, 0, 0]} animationDuration={600} />
        <Bar dataKey="spent" name="Billed Amount" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ──────────────────────────────────────────────
// Efficiency Donut Chart
// ──────────────────────────────────────────────
function EfficiencyDonut({ billable, nonBillable }: { billable: number; nonBillable: number }) {
  const total = billable + nonBillable;
  const data = [
    { name: "Billable", value: billable },
    { name: "Non-Billable", value: nonBillable },
  ];
  const pct = total > 0 ? Math.round((billable / total) * 100) : 0;
  return (
    <div className="relative flex items-center justify-center">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={3} cornerRadius={6} animationDuration={700}>
            <Cell fill="#10b981" stroke="var(--card)" strokeWidth={2} />
            <Cell fill="#f59e0b" stroke="var(--card)" strokeWidth={2} />
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v) || 0} hrs`, ""]} />
          <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ paddingBottom: 36 }}>
        <span className="text-3xl font-black text-foreground">{pct}%</span>
        <span className="text-xs text-muted-foreground font-medium">Billable</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Variance Scatter Plot
// ──────────────────────────────────────────────
function VarianceScatter({ data }: { data: { x: number; y: number; z: number; name: string }[] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
        <XAxis dataKey="x" name="Estimated" type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} label={{ value: "Est. Hours", position: "insideBottom", offset: -4, fontSize: 10, fill: "var(--muted-foreground)" }} />
        <YAxis dataKey="y" name="Actual" type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} label={{ value: "Actual Hours", angle: -90, position: "insideLeft", fontSize: 10, fill: "var(--muted-foreground)" }} />
        <ZAxis dataKey="z" range={[40, 400]} />
        <ReferenceLine x={0} stroke="var(--border)" />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: "3 3" }}
          content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div style={TOOLTIP_STYLE} className="p-2 rounded-xl border">
                <p className="font-bold text-xs mb-1">{d.name}</p>
                <p className="text-xs">Est: {d.x}h · Actual: {d.y}h</p>
                <p className="text-xs">{d.y > d.x ? `⚠ +${d.y - d.x}h overrun` : d.y === d.x ? "✓ On budget" : `✓ ${d.x - d.y}h saved`}</p>
              </div>
            );
          }}
        />
        <Scatter name="Projects" data={data} fill="#6366f1" opacity={0.8} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ──────────────────────────────────────────────
// Milestone Completion Bar Chart
// ──────────────────────────────────────────────
function MilestoneProgressChart({ data }: { data: { label: string; total: number; done: number }[] }) {
  if (!data.length) return <EmptyChart />;
  const chartData = data.map((d) => ({
    label: d.label,
    completed: d.done,
    pending: d.total - d.done,
    pct: d.total > 0 ? Math.round((d.done / d.total) * 100) : 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.4} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <YAxis dataKey="label" type="category" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={72} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
        <Bar dataKey="completed" name="Completed" stackId="a" fill="#10b981" animationDuration={600} />
        <Bar dataKey="pending" name="Pending" stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ──────────────────────────────────────────────
// Client Revenue Radar Chart
// ──────────────────────────────────────────────
function ClientRadarChart({ data }: { data: { client: string; billable: number; projects: number; budget: number }[] }) {
  if (data.length < 3) return <EmptyChart label="Need ≥3 clients for radar view" />;
  const maxBillable = Math.max(...data.map((d) => d.billable), 1);
  const maxProjects = Math.max(...data.map((d) => d.projects), 1);
  const maxBudget = Math.max(...data.map((d) => d.budget), 1);
  const radarData = [
    { metric: "Billable Hours", ...Object.fromEntries(data.map((d) => [d.client, Math.round((d.billable / maxBillable) * 100)])) },
    { metric: "Project Count", ...Object.fromEntries(data.map((d) => [d.client, Math.round((d.projects / maxProjects) * 100)])) },
    { metric: "Budget Share", ...Object.fromEntries(data.map((d) => [d.client, Math.round((d.budget / maxBudget) * 100)])) },
  ];
  const clientNames = data.map((d) => d.client);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
        {clientNames.slice(0, 5).map((c, i) => (
          <Radar key={c} name={c} dataKey={c} stroke={CHART_COLORS[i]} fill={CHART_COLORS[i]} fillOpacity={0.15} animationDuration={600} />
        ))}
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ──────────────────────────────────────────────
// Hours Area Trend Chart
// ──────────────────────────────────────────────
function HoursAreaChart({ data }: { data: { label: string; billable: number; nonBillable: number }[] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="billableGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="nonBillableGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} angle={-15} textAnchor="end" height={44} interval={0} />
        <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={36} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
        <Area type="monotone" dataKey="billable" name="Billable (hrs)" stroke="#10b981" strokeWidth={2} fill="url(#billableGrad)" animationDuration={700} />
        <Area type="monotone" dataKey="nonBillable" name="Non-Billable (hrs)" stroke="#f59e0b" strokeWidth={2} fill="url(#nonBillableGrad)" animationDuration={700} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ──────────────────────────────────────────────
// Team Size vs Hours Line/Bar combo
// ──────────────────────────────────────────────
function TeamVsHoursChart({ data }: { data: { label: string; teamSize: number; actualHours: number }[] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 48 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={56} interval={0} />
        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={36} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={36} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
        <Bar yAxisId="left" dataKey="actualHours" name="Actual Hours" fill="#6366f1" radius={[4, 4, 0, 0]} animationDuration={600} />
        <Line yAxisId="right" type="monotone" dataKey="teamSize" name="Team Size" stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: "#f97316" }} animationDuration={700} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ──────────────────────────────────────────────
// Progress Distribution Pie
// ──────────────────────────────────────────────
function ProgressDistributionPie({ data }: { data: { label: string; count: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90} paddingAngle={2} cornerRadius={5} animationDuration={600}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} stroke="var(--card)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ──────────────────────────────────────────────
// Billing Model Distribution Donut
// ──────────────────────────────────────────────
function BillingModelDonut({ hourly, fixed, other }: { hourly: number; fixed: number; other: number }) {
  const data = [
    { name: "Hourly Rate", value: hourly },
    { name: "Fixed Cost", value: fixed },
    { name: "Other", value: other },
  ].filter((d) => d.value > 0);
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} cornerRadius={6} animationDuration={600}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i]} stroke="var(--card)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ label = "No data for selected filters" }: { label?: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">{label}</div>
  );
}

// ──────────────────────────────────────────────
// Efficiency score badge
// ──────────────────────────────────────────────
function EfficiencyBadge({ value }: { value: number }) {
  const cls =
    value >= 80 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
    value >= 60 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
    "bg-rose-500/10 text-rose-600 dark:text-rose-400";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{value}%</span>;
}

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
export default function ProjectClientAnalytics({ projects, clients }: Props) {
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedModel, setSelectedModel] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");

  const filteredProjects = projects.filter((p) => {
    if (selectedClientId !== "all" && p.clientId !== selectedClientId) return false;
    if (selectedStatus !== "all" && p.status !== selectedStatus) return false;
    if (selectedModel === "hourly" && !p.category?.toLowerCase().includes("hourly")) return false;
    if (selectedModel === "fixed" && p.category?.toLowerCase().includes("hourly")) return false;
    if (selectedPriority !== "all" && p.priority !== selectedPriority) return false;
    return true;
  });

  // ── KPI aggregations ──
  const totalEstimated = filteredProjects.reduce((s, p) => s + (p.estimatedHours || 0), 0);
  const totalActual = filteredProjects.reduce((s, p) => s + (p.actualHours || 0), 0);
  const totalBillable = filteredProjects.reduce((s, p) => s + (p.billableHours || 0), 0);
  const totalNonBillable = filteredProjects.reduce((s, p) => s + (p.nonBillableHours || 0), 0);
  const totalBudget = filteredProjects.reduce((s, p) => s + (p.estimatedBudget || 0), 0);
  const billableRatio = totalActual > 0 ? Math.round((totalBillable / totalActual) * 100) : 0;
  const overrunProjects = filteredProjects.filter((p) => p.estimatedHours > 0 && p.actualHours > p.estimatedHours).length;
  const avgProgress = filteredProjects.length > 0
    ? Math.round(filteredProjects.reduce((s, p) => s + (p.progressPercent ?? 0), 0) / filteredProjects.length)
    : 0;
  const effortVariance = totalActual - totalEstimated;

  // ── Chart 1: Estimated vs Actual ──
  const estVsActData = filteredProjects.slice(0, 10).map((p) => ({
    label: p.projectCode,
    a: p.estimatedHours || 0,
    b: p.actualHours || 0,
  }));

  // ── Chart 2: Client billable vs non-billable ──
  const clientMap: Record<string, { billable: number; nonBillable: number }> = {};
  filteredProjects.forEach((p) => {
    const c = clientMap[p.clientName] || { billable: 0, nonBillable: 0 };
    c.billable += p.billableHours;
    c.nonBillable += p.nonBillableHours;
    clientMap[p.clientName] = c;
  });
  const clientBillableData = Object.entries(clientMap).map(([label, val]) => ({
    label, a: val.billable, b: val.nonBillable,
  }));

  // ── Chart 3: Status pie ──
  const statusCounts: Record<string, number> = {};
  filteredProjects.forEach((p) => {
    const isOverrun = p.estimatedHours > 0 && p.actualHours > p.estimatedHours;
    const st = isOverrun ? "overrun" : p.status || "active";
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  });
  const pieChartData: StatusPieDatum[] = Object.entries(statusCounts).map(([st, count]) => ({
    status: st, label: st.toUpperCase().replace("_", " "), count,
  }));

  // ── Chart 4: Budget utilization ──
  const budgetData = filteredProjects
    .filter((p) => p.estimatedBudget > 0)
    .slice(0, 8)
    .map((p) => ({
      label: p.projectCode,
      budget: p.estimatedBudget || 0,
      spent: Math.round((p.billableHours || 0) * 2500), // approximate billed amount
    }));

  // ── Chart 5: Variance Scatter ──
  const scatterData = filteredProjects
    .filter((p) => p.estimatedHours > 0 || p.actualHours > 0)
    .slice(0, 20)
    .map((p) => ({
      x: p.estimatedHours || 0,
      y: p.actualHours || 0,
      z: (p.teamSize || 1) * 50,
      name: p.name,
    }));

  // ── Chart 6: Milestone progress ──
  const milestoneData = filteredProjects
    .filter((p) => (p.milestoneCount || 0) > 0)
    .slice(0, 8)
    .map((p) => ({
      label: p.projectCode,
      total: p.milestoneCount || 0,
      done: p.completedMilestones || 0,
    }));

  // ── Chart 7: Client radar ──
  const clientRadarData = Object.entries(clientMap)
    .map(([client, val]) => ({
      client,
      billable: val.billable,
      projects: filteredProjects.filter((p) => p.clientName === client).length,
      budget: filteredProjects.filter((p) => p.clientName === client).reduce((s, p) => s + (p.estimatedBudget || 0), 0),
    }))
    .slice(0, 5);

  // ── Chart 8: Hours area trend (per-project sorted by billable) ──
  const hoursAreaData = filteredProjects
    .slice()
    .sort((a, b) => (b.billableHours || 0) - (a.billableHours || 0))
    .slice(0, 8)
    .map((p) => ({ label: p.projectCode, billable: p.billableHours || 0, nonBillable: p.nonBillableHours || 0 }));

  // ── Chart 9: Team vs Hours ──
  const teamVsHoursData = filteredProjects
    .filter((p) => (p.teamSize || 0) > 0)
    .slice(0, 8)
    .map((p) => ({ label: p.projectCode, teamSize: p.teamSize || 0, actualHours: p.actualHours || 0 }));

  // ── Chart 10: Progress distribution ──
  const progressBuckets = [
    { label: "0–25%", count: 0, color: "#ef4444" },
    { label: "26–50%", count: 0, color: "#f59e0b" },
    { label: "51–75%", count: 0, color: "#3b82f6" },
    { label: "76–99%", count: 0, color: "#6366f1" },
    { label: "100%", count: 0, color: "#10b981" },
  ];
  filteredProjects.forEach((p) => {
    const pct = p.progressPercent ?? 0;
    if (pct <= 25) progressBuckets[0].count++;
    else if (pct <= 50) progressBuckets[1].count++;
    else if (pct <= 75) progressBuckets[2].count++;
    else if (pct < 100) progressBuckets[3].count++;
    else progressBuckets[4].count++;
  });

  // ── Billing model counts ──
  const hourlyCount = filteredProjects.filter((p) => p.category?.toLowerCase().includes("hourly")).length;
  const fixedCount = filteredProjects.filter((p) => !p.category?.toLowerCase().includes("hourly") && p.category).length;
  const otherCount = filteredProjects.length - hourlyCount - fixedCount;

  return (
    <div className="space-y-8">

      {/* ── Filter Bar ── */}
      <FilterCardShell description="Slice every chart and table below by client, status, billing model and priority">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedClientId} onValueChange={(v) => setSelectedClientId(v || "all")}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All Clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients ({clients.length})</SelectItem>
              {clients.map((c) => (<SelectItem key={c._id} value={c._id}>{c.companyName}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v || "all")}>
            <SelectTrigger className="h-8 w-34 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="testing">Testing</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v || "all")}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Models" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Billing Models</SelectItem>
              <SelectItem value="hourly">Hourly Rate</SelectItem>
              <SelectItem value="fixed">Fixed Cost</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedPriority} onValueChange={(v) => setSelectedPriority(v || "all")}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterCardShell>

      {/* ── KPI Row 1: Core metrics ── */}
      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Core Portfolio KPIs</h2>
        <KpiGrid>
          <KpiCard label="Total Projects" value={filteredProjects.length} accent icon={<FolderKanban className="size-4" />} />
          <KpiCard label="Total Logged Hours" value={`${totalActual} hrs`} icon={<Clock className="size-4" />} />
          <KpiCard label="Billable Hours" value={`${totalBillable} hrs`} tone="up" icon={<CheckCircle2 className="size-4 text-emerald-500" />} />
          <KpiCard label="Non-Billable Hrs" value={`${totalNonBillable} hrs`} icon={<AlertCircle className="size-4" />} />
        </KpiGrid>
      </div>

      {/* ── KPI Row 2: Financial & efficiency ── */}
      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Financial &amp; Efficiency Metrics</h2>
        <KpiGrid>
          <KpiCard label="Billable Efficiency" value={`${billableRatio}%`} tone={billableRatio >= 70 ? "up" : "down"} icon={<TrendingUp className="size-4" />} />
          <KpiCard label="Portfolio Budget" value={formatMoney(totalBudget)} icon={<Coins className="size-4" />} />
          <KpiCard label="Effort Overrun" value={`${overrunProjects} Projects`} tone={overrunProjects > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4 text-amber-500" />} />
          <KpiCard label="Avg. Completion" value={`${avgProgress}%`} icon={<Target className="size-4" />} />
        </KpiGrid>
      </div>

      {/* ── Row 3: KPI Row 3 ── */}
      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Hours Breakdown</h2>
        <KpiGrid>
          <KpiCard label="Estimated Total" value={`${totalEstimated} hrs`} icon={<Activity className="size-4" />} />
          <KpiCard label="Effort Variance" value={effortVariance >= 0 ? `+${effortVariance} hrs overrun` : `${Math.abs(effortVariance)} hrs saved`} tone={effortVariance > 0 ? "down" : "up"} icon={effortVariance > 0 ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />} />
          <KpiCard label="Hourly Projects" value={hourlyCount} icon={<Zap className="size-4" />} />
          <KpiCard label="Fixed-Cost Projects" value={fixedCount} icon={<Layers className="size-4" />} />
        </KpiGrid>
      </div>

      {/* ── Charts Section 1: Core Comparisons ── */}
      <div className="space-y-3">
        <SectionHeading icon={<BarChart2 className="size-4" />} title="Effort Comparison Charts" subtitle="Estimated vs Actual hours and client-wise billing breakdown" />
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><BarChart2 className="size-4 text-primary" />Estimated vs Actual Hours</CardTitle></CardHeader>
            <CardContent>
              <GroupedBarChart data={estVsActData} aName="Estimated (hrs)" bName="Actual Spent (hrs)" height={250} />
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><Building2 className="size-4 text-primary" />Client-wise Billable vs Non-Billable</CardTitle></CardHeader>
            <CardContent>
              <GroupedBarChart data={clientBillableData} aName="Billable (hrs)" bName="Non-Billable (hrs)" height={250} />
            </CardContent>
          </GlassCard>
        </div>
      </div>

      {/* ── Charts Section 2: Financial ── */}
      <div className="space-y-3">
        <SectionHeading icon={<Coins className="size-4" />} title="Budget &amp; Billing Analysis" subtitle="Contract budget vs billed amount and billing efficiency ratio" />
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><Coins className="size-4 text-primary" />Budget vs Billed Amount</CardTitle></CardHeader>
            <CardContent>
              <BudgetUtilizationChart data={budgetData} />
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><PieIcon className="size-4 text-primary" />Billable Efficiency Ratio</CardTitle></CardHeader>
            <CardContent>
              <EfficiencyDonut billable={totalBillable} nonBillable={totalNonBillable} />
            </CardContent>
          </GlassCard>
        </div>
      </div>

      {/* ── Charts Section 3: Health & Status ── */}
      <div className="space-y-3">
        <SectionHeading icon={<Activity className="size-4" />} title="Project Health &amp; Status" subtitle="Status distribution, progress buckets, and billing model breakdown" />
        <div className="grid gap-4 lg:grid-cols-3">
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><PieIcon className="size-4 text-primary" />Status Distribution</CardTitle></CardHeader>
            <CardContent>
              <StatusPieChart data={pieChartData} colors={STATUS_PIE_COLORS} />
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><Target className="size-4 text-primary" />Progress Distribution</CardTitle></CardHeader>
            <CardContent>
              <ProgressDistributionPie data={progressBuckets} />
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><Layers className="size-4 text-primary" />Billing Model Split</CardTitle></CardHeader>
            <CardContent>
              <BillingModelDonut hourly={hourlyCount} fixed={fixedCount} other={otherCount} />
            </CardContent>
          </GlassCard>
        </div>
      </div>

      {/* ── Charts Section 4: Advanced ── */}
      <div className="space-y-3">
        <SectionHeading icon={<Zap className="size-4" />} title="Advanced Analytics" subtitle="Variance scatter, milestone completion, and client comparison radar" />
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2"><TrendingUp className="size-4 text-primary" />Effort Variance Scatter Plot</CardTitle>
              <p className="text-xs text-muted-foreground">Each dot = 1 project · Above diagonal = overrun</p>
            </CardHeader>
            <CardContent>
              <VarianceScatter data={scatterData} />
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><Users className="size-4 text-primary" />Client Comparison (Radar)</CardTitle></CardHeader>
            <CardContent>
              <ClientRadarChart data={clientRadarData} />
            </CardContent>
          </GlassCard>
          {milestoneData.length > 0 && (
            <GlassCard>
              <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" />Milestone Completion by Project</CardTitle></CardHeader>
              <CardContent>
                <MilestoneProgressChart data={milestoneData} />
              </CardContent>
            </GlassCard>
          )}
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><LineChartIcon className="size-4 text-primary" />Billable vs Non-Billable (Area)</CardTitle></CardHeader>
            <CardContent>
              <HoursAreaChart data={hoursAreaData} />
            </CardContent>
          </GlassCard>
        </div>
      </div>

      {/* ── Team Size Section ── */}
      {teamVsHoursData.length > 0 && (
        <div className="space-y-3">
          <SectionHeading icon={<Users className="size-4" />} title="Team Capacity vs Output" subtitle="Team size compared to actual hours logged per project" />
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold flex items-center gap-2"><Users className="size-4 text-primary" />Team Size vs Actual Hours</CardTitle></CardHeader>
            <CardContent>
              <TeamVsHoursChart data={teamVsHoursData} />
            </CardContent>
          </GlassCard>
        </div>
      )}

      {/* ── Billing PDFs Table ── */}
      <div className="space-y-3">
        <SectionHeading icon={<FolderKanban className="size-4" />} title="Project Effort &amp; Instant Billing PDFs" subtitle="Instant Tax Invoice PDF & Payment Receipt PDF downloads per project" />
        <GlassCard interactive={false}>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
            <div>
              <CardTitle className="text-base font-bold">All Projects — Billing Overview</CardTitle>
              <p className="text-xs text-muted-foreground">{filteredProjects.length} projects matching current filters</p>
            </div>
          </CardHeader>
          <CardContent className="overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs">
                  <TableHead>Code</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Est. Hrs</TableHead>
                  <TableHead className="text-right">Actual Hrs</TableHead>
                  <TableHead className="text-right">Billable</TableHead>
                  <TableHead className="text-right">Non-Bill.</TableHead>
                  <TableHead className="text-center">Efficiency</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Billing PDFs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center p-8 text-sm text-muted-foreground">No projects match the selected filters.</TableCell>
                  </TableRow>
                ) : (
                  filteredProjects.map((p) => {
                    const variance = (p.actualHours || 0) - (p.estimatedHours || 0);
                    const isOverrun = p.estimatedHours > 0 && variance > 0;
                    const totalHrs = (p.billableHours || 0) + (p.nonBillableHours || 0);
                    const eff = totalHrs > 0 ? Math.round(((p.billableHours || 0) / totalHrs) * 100) : 100;
                    return (
                      <TableRow key={p._id} className="text-xs hover:bg-muted/30">
                        <TableCell className="font-mono font-bold text-primary">{p.projectCode}</TableCell>
                        <TableCell className="font-semibold max-w-[140px] truncate">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[100px] truncate">{p.clientName}</TableCell>
                        <TableCell className="text-center">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_PIE_COLORS[p.status] ? "" : ""}`}
                            style={{ background: `${STATUS_PIE_COLORS[p.status] || "#94a3b8"}22`, color: STATUS_PIE_COLORS[p.status] || "#94a3b8" }}>
                            {p.status?.replace("_", " ")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{p.estimatedHours || 0}h</TableCell>
                        <TableCell className="text-right font-mono font-bold">{p.actualHours || 0}h</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">{p.billableHours || 0}h</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{p.nonBillableHours || 0}h</TableCell>
                        <TableCell className="text-center"><EfficiencyBadge value={eff} /></TableCell>
                        <TableCell className="text-right font-mono">
                          {isOverrun ? (
                            <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-bold text-rose-600 dark:text-rose-400">+{variance}h</span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{variance === 0 ? "—" : `${variance}h`}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">{formatMoney(p.estimatedBudget || 0, p.currency)}</TableCell>
                        <TableCell className="text-right">
                          <ProjectBillingDownloadButtons projectId={p._id} projectCode={p.projectCode} variant="compact" />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}
