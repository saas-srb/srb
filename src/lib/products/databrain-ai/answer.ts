import { CHART_POINTS, STORED_TABLE_ROWS, type Block, type BlockColumn, type ChartKind, type KpiFormat, type Scalar } from "@/lib/products/databrain-ai/blocks";
import type { QueryResult } from "@/lib/products/databrain-ai/query/execute";

/**
 * Turns the model's `final_answer` into the blocks the user sees. The model's
 * blocks are a RECIPE: text it wrote, plus references (queryId + column names)
 * into query results the server itself ran. Everything numeric is copied from
 * the real result here; any field the model adds beyond the recipe (a `data`,
 * `values`, `rows`, `value`, `points` …) is dropped and noted.
 */

export const FINAL_ANSWER_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["blocks"],
  properties: {
    blocks: {
      type: "array",
      description:
        "The answer, in order. A short text summary first, then kpi/table/chart blocks that REFERENCE queries you ran (by queryId and column names). Never put numbers or data points in kpi, table or chart blocks: the server fills them from the query results.",
      items: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "string", enum: ["text", "kpi", "table", "chart", "list"] },
          text: { type: "string", description: "text: markdown (no HTML, no images). Only state figures that appear in the query results; say 'no data' when a result is empty." },
          label: { type: "string", description: "kpi: the label shown above the number." },
          queryId: { type: "string", description: "kpi/table/chart: a queryId returned by run_query." },
          column: { type: "string", description: "kpi: the result column holding the value (first row unless `row` is given)." },
          row: { type: "integer", description: "kpi: zero-based row of the result (default 0)." },
          format: { type: "string", enum: ["number", "money", "percent", "text"], description: "kpi: how to show the value (default from the column type)." },
          title: { type: "string", description: "table/chart/list: heading." },
          columns: { type: "array", items: { type: "string" }, description: "table: which result columns to show, in order (default all)." },
          chartType: { type: "string", enum: ["bar", "line", "pie", "area"], description: "chart: use line/area for time series, pie for shares (<= 8 slices), bar otherwise; a comparison is a grouped bar with several y columns." },
          x: { type: "string", description: "chart: the result column for the x axis / pie labels." },
          y: { type: "array", items: { type: "string" }, description: "chart: numeric result columns to plot (1-4)." },
          items: { type: "array", items: { type: "string" }, description: "list: bullet items (text only)." },
        },
      },
    },
  },
} as const;

const ALLOWED_KEYS: Record<string, readonly string[]> = {
  text: ["type", "text"],
  kpi: ["type", "label", "queryId", "column", "row", "format"],
  table: ["type", "queryId", "title", "columns"],
  chart: ["type", "queryId", "title", "chartType", "x", "y"],
  list: ["type", "title", "items"],
};

const MAX_BLOCKS = 12;
const MAX_TEXT = 4000;

/** Markdown from the model is untrusted: no images (a data-exfiltration channel), no raw HTML tags. */
export function sanitizeMarkdown(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, "")
    .replace(/<\/?[a-zA-Z!][^>]*>/g, "")
    .replace(/\[([^\]]*)\]\(\s*(?!\/|#)[^)]*\)/g, "$1") // only in-app links survive; external URLs become plain text
    .slice(0, MAX_TEXT)
    .trim();
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const asColumn = (c: QueryResult["columns"][number]): BlockColumn => ({ key: c.key, label: c.label, type: c.type, ...(c.unit ? { unit: c.unit } : {}) });

export interface ResolvedAnswer {
  blocks: Block[];
  /** What was dropped or stripped, for logs and tests. */
  notes: string[];
}

export function resolveBlocks(raw: unknown, results: ReadonlyMap<string, QueryResult>): ResolvedAnswer {
  const notes: string[] = [];
  const blocks: Block[] = [];
  const input = isObj(raw) && Array.isArray(raw.blocks) ? raw.blocks : [];
  if (input.length === 0) notes.push("no blocks");

  for (const [i, b] of input.slice(0, MAX_BLOCKS).entries()) {
    if (!isObj(b) || typeof b.type !== "string" || !(b.type in ALLOWED_KEYS)) {
      notes.push(`block ${i}: unknown type dropped`);
      continue;
    }
    for (const k of Object.keys(b)) if (!ALLOWED_KEYS[b.type].includes(k)) notes.push(`block ${i} (${b.type}): stripped unsupported field "${k}"`);

    if (b.type === "text") {
      const text = typeof b.text === "string" ? sanitizeMarkdown(b.text) : "";
      if (text) blocks.push({ type: "text", markdown: text });
      continue;
    }
    if (b.type === "list") {
      const items = (Array.isArray(b.items) ? b.items : []).filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 20).map((x) => sanitizeMarkdown(x).slice(0, 300));
      if (items.length) blocks.push({ type: "list", title: str(b.title, 120), items });
      continue;
    }

    const result = typeof b.queryId === "string" ? results.get(b.queryId) : undefined;
    if (!result) {
      notes.push(`block ${i} (${b.type}): unknown queryId dropped`);
      continue;
    }
    const cols = new Map(result.columns.map((c) => [c.key, c]));

    if (b.type === "kpi") {
      const col = typeof b.column === "string" ? cols.get(b.column) : undefined;
      const row = typeof b.row === "number" && Number.isInteger(b.row) && b.row >= 0 ? b.row : 0;
      const label = str(b.label, 80);
      if (!col || !label || row >= result.rows.length) {
        notes.push(`block ${i} (kpi): bad column/label/row dropped`);
        continue;
      }
      const value = result.rows[row][col.key] as Scalar;
      const wanted = b.format as KpiFormat | undefined;
      const numeric = typeof value === "number";
      const format: KpiFormat = numeric ? (wanted === "percent" || wanted === "number" || wanted === "money" ? wanted : col.type === "money" ? "money" : "number") : "text";
      blocks.push({ type: "kpi", label, value, format, queryId: result.queryId });
      continue;
    }

    if (b.type === "table") {
      let columns = (Array.isArray(b.columns) ? b.columns : []).filter((k): k is string => typeof k === "string" && cols.has(k)).map((k) => asColumn(cols.get(k)!));
      if (columns.length === 0) columns = result.columns.map(asColumn);
      const keys = columns.map((c) => c.key);
      const rows = result.rows.slice(0, STORED_TABLE_ROWS).map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
      blocks.push({ type: "table", title: str(b.title, 120), queryId: result.queryId, columns, rows, rowCount: result.rowCount, truncated: result.truncated || result.rowCount > rows.length });
      continue;
    }

    // chart
    const chart = b.chartType as ChartKind;
    const x = typeof b.x === "string" ? cols.get(b.x) : undefined;
    const y = (Array.isArray(b.y) ? b.y : []).filter((k): k is string => typeof k === "string" && cols.has(k) && ["number", "money"].includes(cols.get(k)!.type)).slice(0, 4);
    if (!["bar", "line", "pie", "area"].includes(chart) || !x || y.length === 0) {
      notes.push(`block ${i} (chart): needs chartType, an x column and numeric y columns; dropped`);
      continue;
    }
    const keys = [x.key, ...y];
    const limit = chart === "pie" ? 12 : CHART_POINTS;
    const rows = result.rows.slice(0, limit).map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
    blocks.push({
      type: "chart",
      chart: y.length > 1 && chart === "pie" ? "bar" : chart,
      title: str(b.title, 120) ?? result.description.entityLabel,
      queryId: result.queryId,
      x: x.key,
      y: chart === "pie" ? y.slice(0, 1) : y,
      columns: keys.map((k) => asColumn(cols.get(k)!)),
      rows,
      rowCount: result.rowCount,
      truncated: result.truncated || result.rowCount > rows.length,
    });
  }
  return { blocks, notes };
}

/** The plain-text rendering of an answer, kept for conversation memory and "copy": text, list items, KPIs and table captions. */
export function blocksToText(blocks: readonly Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "text") out.push(b.markdown);
    else if (b.type === "list") out.push([b.title, ...b.items.map((i) => `- ${i}`)].filter(Boolean).join("\n"));
    else if (b.type === "kpi") out.push(`${b.label}: ${b.value ?? "—"}`);
    else if (b.type === "table") out.push(`[Table${b.title ? `: ${b.title}` : ""} — ${b.rowCount} row${b.rowCount === 1 ? "" : "s"}]`);
    else out.push(`[Chart: ${b.title}]`);
  }
  return out.join("\n\n").trim();
}
