"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCell, formatKpi, type Block, type BlockColumn, type BlockRow, type StoredQuery } from "@/lib/products/databrain-ai/blocks";

const ChartBlock = dynamic(() => import("@/components/products/databrain-ai/ChartBlock"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted/50" aria-label="Loading chart" />,
});

// ── Safe markdown: model text is untrusted. No HTML, no images (a data-exfiltration channel), only in-app links. ──
const md: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  a: ({ href, children }) =>
    href && href.startsWith("/") && !href.startsWith("//") ? (
      <a href={href} className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: () => null,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h3 className="mt-3 mb-2 text-base font-bold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 mb-2 text-sm font-bold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  code: ({ children }) => <code className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground italic">{children}</blockquote>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border/60 bg-muted/50 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border/60 px-2 py-1">{children}</td>,
};

export function SafeMarkdown({ text }: { text: string }) {
  return (
    <div className="text-sm break-words text-foreground/90">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ── CSV / clipboard ──────────────────────────────────────────────────────────

function cellText(v: BlockRow[string], col: BlockColumn): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return col.type === "enum" && typeof v === "string" ? v.replace(/_/g, " ") : String(v);
}
/** Spreadsheet formula injection: a text cell that starts like a formula is neutralised. */
const safeCell = (s: string) => (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s);
const csvField = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function tableToCsv(columns: BlockColumn[], rows: BlockRow[]): string {
  const head = columns.map((c) => csvField(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvField(safeCell(cellText(r[c.key], c)))).join(","));
  return `﻿${[head, ...body].join("\r\n")}`;
}
export function tableToTsv(columns: BlockColumn[], rows: BlockRow[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ");
  return [columns.map((c) => clean(c.label)).join("\t"), ...rows.map((r) => columns.map((c) => clean(safeCell(cellText(r[c.key], c)))).join("\t"))].join("\n");
}

async function copy(text: string, ok: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(ok);
  } catch {
    toast.error("Couldn't copy to the clipboard.");
  }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "table";
}

// ── Blocks ───────────────────────────────────────────────────────────────────

function TableBlock({ b }: { b: Extract<Block, { type: "table" }> }) {
  const [done, setDone] = useState(false);
  const note = b.rowCount > b.rows.length || b.truncated ? `Showing the first ${b.rows.length.toLocaleString("en-IN")} of ${b.rowCount.toLocaleString("en-IN")}${b.truncated ? "+" : ""} rows.` : null;
  return (
    <div className="min-w-0 rounded-xl border border-border/50 bg-background/60 dark:bg-card/40" data-block="table">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">{b.title ?? "Table"}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={async () => {
              await copy(tableToTsv(b.columns, b.rows), "Table copied — paste it into a spreadsheet");
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            }}
            aria-label="Copy as table"
          >
            {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            Copy as table
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([tableToCsv(b.columns, b.rows)], { type: "text/csv;charset=utf-8" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `${slug(b.title ?? "table")}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            aria-label="Download CSV"
          >
            <Download className="size-3.5" />
            CSV
          </Button>
        </div>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur">
            <tr>
              {b.columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-3 py-2 font-semibold whitespace-nowrap text-muted-foreground", c.type === "number" || c.type === "money" ? "text-right" : "text-left")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i} className="border-t border-border/40">
                {b.columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-1.5 whitespace-nowrap", c.type === "number" || c.type === "money" ? "text-right tabular-nums" : "text-left")}>
                    {formatCell(r[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
            {b.rows.length === 0 && (
              <tr>
                <td colSpan={b.columns.length} className="px-3 py-6 text-center text-muted-foreground">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {note && <p className="border-t border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

export function AnswerBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "text":
            return <SafeMarkdown key={i} text={b.markdown} />;
          case "list":
            return (
              <div key={i}>
                {b.title && <p className="mb-1 text-sm font-semibold">{b.title}</p>}
                <ul className="ml-4 list-disc space-y-1 text-sm marker:text-muted-foreground">
                  {b.items.map((it, j) => (
                    <li key={j}>{it}</li>
                  ))}
                </ul>
              </div>
            );
          case "kpi":
            return (
              <div key={i} className="inline-flex min-w-40 flex-col rounded-xl border border-border/50 bg-gradient-to-br from-primary/10 to-secondary/10 px-4 py-3 align-top" data-block="kpi">
                <span className="text-xs font-medium text-muted-foreground">{b.label}</span>
                <span className="text-2xl font-black tracking-tight text-foreground tabular-nums">{formatKpi(b.value, b.format)}</span>
              </div>
            );
          case "table":
            return <TableBlock key={i} b={b} />;
          case "chart":
            return (
              <div key={i} data-block="chart">
                <ChartBlock chart={b.chart} title={b.title} x={b.x} y={b.y} columns={b.columns} rows={b.rows} />
              </div>
            );
        }
      })}
    </div>
  );
}

/** "How this was calculated": what each query actually did, from the validated plan. */
export function HowCalculated({ queries }: { queries: StoredQuery[] }) {
  const [open, setOpen] = useState(false);
  if (queries.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-border/40 bg-muted/30" data-testid="how-calculated">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        How this was calculated
      </button>
      {open && (
        <ol className="space-y-2 border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
          {queries.map((q) => (
            <li key={q.queryId}>
              {q.error ? (
                <p>
                  <span className="font-semibold text-foreground">{q.entityLabel || "Query"}</span> — not run: {q.error}
                </p>
              ) : (
                <>
                  <p>
                    <span className="font-semibold text-foreground">{q.entityLabel}</span> — {q.rowCount.toLocaleString("en-IN")} row{q.rowCount === 1 ? "" : "s"}
                    {q.truncated ? " (more matched than the limit)" : ""}
                  </p>
                  <ul className="mt-0.5 ml-4 list-disc">
                    {q.measures.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                    {q.groupedBy.length > 0 && <li>Grouped by {q.groupedBy.join(", ")}</li>}
                    {q.filters.length > 0 && <li>Filters: {q.filters.join("; ")}</li>}
                    {q.joins.length > 0 && <li>Joined: {q.joins.join(", ")}</li>}
                  </ul>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
