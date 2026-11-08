"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Filter, RotateCcw, Search, Sparkles } from "lucide-react";

/**
 * The standard "Search & Filters" card for list pages that have no filter bar of their own, in exactly the look of
 * every other product's (title, subtitle, controls, Reset). It sits right under the page header and narrows the list
 * below it in the browser: a text search over the rows, plus a drop-down for every table column that holds only a few
 * distinct values (status, type, category …). Pages whose lists filter on the server keep their own bar. The card is
 * always shown so every page looks the same; on pages with no table or card list (reports, dashboards) the search
 * narrows the page's sections instead.
 */

interface Column {
  index: number;
  label: string;
  values: string[];
}

const SELECT = "w-full cursor-pointer rounded-xl border border-border/50 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

interface Found {
  rows: HTMLElement[];
  headers: string[];
  table: boolean;
}

/** The list the card should filter: the biggest data table, else the biggest run of look-alike cards / list items. */
function mainList(root: HTMLElement, minRows: number): Found | null {
  let best: Found | null = null;
  root.querySelectorAll("table").forEach((t) => {
    const rows = [...t.querySelectorAll<HTMLTableRowElement>("tbody > tr")].filter((r) => r.cells.length > 1);
    if (rows.length > (best?.rows.length ?? 0)) {
      const heads = [...t.querySelectorAll<HTMLTableCellElement>("thead th")].map((h) => (h.textContent ?? "").trim());
      best = { rows, headers: heads, table: true };
    }
  });
  if (best && (best as Found).rows.length >= minRows) return best;
  // Card / list pages: siblings that share a tag and class and each carry some text.
  let cards: HTMLElement[] = [];
  const consider = (parent: Element) => {
    const groups = new Map<string, HTMLElement[]>();
    for (const c of parent.children) {
      if (!(c instanceof HTMLElement) || !c.className || (c.textContent ?? "").trim().length < 8) continue;
      const key = `${c.tagName}|${c.className}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    for (const g of groups.values()) if (g.length > cards.length) cards = g;
  };
  consider(root);
  root.querySelectorAll("ul, ol, div, section, tbody").forEach(consider);
  if (cards.length >= Math.max(minRows, 3)) return { rows: cards, headers: [], table: false };
  if (best) return best;
  // No list at all: filter the page's own sections (the blocks directly under the content wrapper).
  let host: Element = root;
  while (host.children.length === 1 && host.firstElementChild) host = host.firstElementChild;
  const sections = [...host.children].filter((c): c is HTMLElement => c instanceof HTMLElement && (c.textContent ?? "").trim().length > 0);
  return sections.length >= 2 ? { rows: sections, headers: [], table: false } : null;
}

export default function PanelListFilters({ children, placeholder = "Search this list…", minRows = 1 }: { children: React.ReactNode; placeholder?: string; minRows?: number }) {
  const body = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [columns, setColumns] = useState<Column[]>([]);
  const [total, setTotal] = useState(0);
  const [shown, setShown] = useState(0);
  const state = useRef({ query: "", picked: {} as Record<number, string> });
  state.current = { query, picked };

  const apply = useCallback(() => {
    const root = body.current;
    if (!root) return;
    const t = mainList(root, minRows);
    if (!t) return;
    const q = state.current.query.trim().toLowerCase();
    let visible = 0;
    for (const row of t.rows) {
      const okText = !q || (row.textContent ?? "").toLowerCase().includes(q);
      const okCols = Object.entries(state.current.picked).every(([i, v]) => !v || ((row as HTMLTableRowElement).cells?.[Number(i)]?.textContent ?? "").trim() === v);
      row.hidden = !(okText && okCols);
      if (!row.hidden) visible++;
    }
    setShown(visible);
  }, []);

  const scan = useCallback(() => {
    const root = body.current;
    if (!root) return;
    const t = mainList(root, minRows);
    if (!t) {
      setTotal(0);
      setColumns([]);
      return;
    }
    setTotal(t.rows.length);
    const cols: Column[] = [];
    const width = t.table ? Math.max(...t.rows.map((r) => (r as HTMLTableRowElement).cells.length)) : 0;
    for (let i = 1; i < width; i++) {
      const label = t.headers[i];
      if (!label || /action|amount|total|date|created|updated|due|qty|quantity|price|#/i.test(label)) continue;
      const vals = new Set<string>();
      let ok = true;
      for (const r of t.rows) {
        const text = ((r as HTMLTableRowElement).cells[i]?.textContent ?? "").trim();
        if (!text || text.length > 28) { ok = false; break; }
        vals.add(text);
        if (vals.size > 10) { ok = false; break; }
      }
      if (ok && vals.size >= 2) cols.push({ index: i, label, values: [...vals].sort() });
    }
    setColumns(cols.slice(0, 4));
    apply();
  }, [apply, minRows]);

  useEffect(() => {
    scan();
    const root = body.current;
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(scan, 80);
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [scan]);

  useEffect(() => apply(), [query, picked, apply]);

  const active = (query.trim() ? 1 : 0) + Object.values(picked).filter(Boolean).length;
  const show = true;

  return (
    <div className="space-y-4">
      {show && (
        <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <Filter className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
                  {active > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      <Sparkles className="size-3" />
                      {active} {active === 1 ? "filter active" : "filters active"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {total > 0 ? `Showing ${shown} of ${total} · refine the list below in real time` : "Search and filter what is on this page"}
                </p>
              </div>
            </div>
            {active > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setPicked({});
                }}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-600 transition-all hover:bg-rose-500/20 dark:text-rose-400"
              >
                <RotateCcw className="size-3.5" />
                Reset Filters
              </button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 items-end gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <div className="sm:col-span-2">
              <label htmlFor="list-search" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Search className="size-3.5 text-primary" />
                Search
              </label>
              <input
                id="list-search"
                type="text"
                autoComplete="off"
                maxLength={80}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {columns.map((c) => (
              <div key={c.index}>
                <label htmlFor={`list-col-${c.index}`} className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Filter className="size-3.5 text-primary" />
                  {c.label}
                </label>
                <select id={`list-col-${c.index}`} value={picked[c.index] ?? ""} onChange={(e) => setPicked((p) => ({ ...p, [c.index]: e.target.value }))} className={SELECT}>
                  <option value="">All</option>
                  {c.values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      <div ref={body} className="space-y-4">
        {children}
      </div>
    </div>
  );
}
