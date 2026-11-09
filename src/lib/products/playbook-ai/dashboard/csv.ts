/** CSV of the dashboard figures (what is on the page, in plain rows). Pure. */
import type { DashboardData } from "@/lib/products/playbook-ai/dashboard/types";

const cell = (v: string | number | null): string => {
  const s = v === null ? "" : String(v);
  // Quote anything with a separator, quote or newline; a leading =, +, - or @ is prefixed so a spreadsheet never runs it as a formula.
  const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function dashboardCsv(d: DashboardData): string {
  const rows: (string | number | null)[][] = [
    ["Playbook dashboard", d.range.label, d.scope === "all" ? "Whole company" : "My items only"], [],
    ["Figure", "Value", "Previous period", "Change %"],
    ...d.tiles.map((t) => [t.label, t.value, t.prev, t.deltaPct]), [],
    ["Created over time", d.created.granularity === "day" ? "Day" : "Week", "SOPs", "Documents", "KPI sheets"],
    ...d.created.points.map((p) => ["", p.label, p.sop, p.document, p.kpi]), [],
    ["Funnel", "Count", "% of created", "Drop from previous step %"],
    ...d.funnel.map((f) => [f.label, f.value, f.pctOfFirst, f.dropPct]), [],
    ["By category", "Count"], ...d.byCategory.map((c) => [c.label, c.value]), [],
    ["By department", "Count"], ...d.byDepartment.map((c) => [c.label, c.value]), [],
    ["Time to sign", "Signed"], ...d.turnaround.buckets.map((b) => [b.label, b.value]), [],
    ["Top templates", "Used"], ...d.topTemplates.map((c) => [c.label, c.value]), [],
    ["Exports", "Count"], ["PDF", d.exports.pdf], ["Word", d.exports.docx], [],
    ["Team", "Created", "Sent", "Signed"], ...d.leaderboard.map((l) => [l.name, l.created, l.sent, l.signed]),
  ];
  return `${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}
