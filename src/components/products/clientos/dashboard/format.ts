import type { ValueFormat } from "@/lib/products/clientos/dashboard/types";

export function formatValue(v: number | string, f: ValueFormat | undefined): string {
  if (typeof v === "string") return v;
  switch (f) {
    case "currency":
      return `₹${Math.round(v).toLocaleString("en-IN")}`;
    case "percent":
      return `${Math.round(v)}%`;
    case "credits":
      return `${Math.round(v).toLocaleString("en-IN")} YO`;
    default:
      return Math.round(v).toLocaleString("en-IN");
  }
}

export const RANGES = [
  { id: "7", label: "7D", days: 7 },
  { id: "30", label: "30D", days: 30 },
  { id: "90", label: "90D", days: 90 },
  { id: "365", label: "12M", days: 365 },
  { id: "all", label: "All", days: null },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];

export function rangeWindow(id: RangeId): { from: number | null; prevFrom: number | null } {
  const days = RANGES.find((r) => r.id === id)?.days ?? null;
  if (!days) return { from: null, prevFrom: null };
  const now = Date.now();
  return { from: now - days * 86400000, prevFrom: now - days * 2 * 86400000 };
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return formatDate(iso);
}

/** Short axis labels: 80K, 1.2L, 3.5Cr for rupee values (Indian grouping); plain K/M otherwise. */
export function compact(n: number, f?: ValueFormat): string {
  const abs = Math.abs(n);
  const rupee = f === "currency";
  let out: string;
  if (rupee && abs >= 1e7) out = `${+(n / 1e7).toFixed(1)}Cr`;
  else if (rupee && abs >= 1e5) out = `${+(n / 1e5).toFixed(1)}L`;
  else if (abs >= 1e3) out = `${+(n / 1e3).toFixed(1)}K`;
  else out = String(Math.round(n));
  return rupee ? `₹${out}` : out;
}
