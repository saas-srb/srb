/**
 * The answer format: an ordered list of BLOCKS. Client-safe (types and tiny
 * helpers only). Blocks that show data (kpi, table, chart) carry the REAL
 * values copied by the server from a validated query result — the model only
 * ever names a queryId and columns, never supplies a number or a data point.
 */

export type Scalar = string | number | boolean | null;
export type BlockRow = Record<string, Scalar>;

export interface BlockColumn {
  key: string;
  label: string;
  type: "string" | "number" | "money" | "date" | "boolean" | "enum" | "id" | "period";
  unit?: "rupees";
}

export type KpiFormat = "number" | "money" | "percent" | "text";
export type ChartKind = "bar" | "line" | "pie" | "area";

export type Block =
  | { type: "text"; markdown: string }
  | { type: "kpi"; label: string; value: Scalar; format: KpiFormat; queryId: string }
  | { type: "table"; title: string | null; queryId: string; columns: BlockColumn[]; rows: BlockRow[]; rowCount: number; truncated: boolean }
  | { type: "chart"; chart: ChartKind; title: string; queryId: string; x: string; y: string[]; columns: BlockColumn[]; rows: BlockRow[]; rowCount: number; truncated: boolean }
  | { type: "list"; title: string | null; items: string[] };

/** One run query, as stored for the "How this was calculated" product (no result rows). */
export interface StoredQuery {
  queryId: string;
  entity: string;
  entityLabel: string;
  measures: string[];
  groupedBy: string[];
  filters: string[];
  joins: string[];
  rowCount: number;
  truncated: boolean;
  /** Present when the plan was rejected or failed (the reason shown is the safe message the model saw). */
  error?: string;
}

export interface IntelMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  blocks: Block[];
  queries: StoredQuery[];
  error: string | null;
  createdAt: string;
}

export const STORED_TABLE_ROWS = 200;
export const CHART_POINTS = 100;

export function humanize(v: string): string {
  return v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
/** Display text for a cell. Money is shown as rupees with Indian digit grouping. */
export function formatCell(v: Scalar | undefined, col: Pick<BlockColumn, "type" | "unit">): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return col.type === "money" ? `₹${inr.format(v)}` : inr.format(v);
  return col.type === "enum" ? humanize(v) : v;
}

export function formatKpi(v: Scalar, format: KpiFormat): string {
  if (v === null) return "—";
  if (typeof v === "number") return format === "money" ? `₹${inr.format(v)}` : format === "percent" ? `${inr.format(v)}%` : inr.format(v);
  return String(v);
}
