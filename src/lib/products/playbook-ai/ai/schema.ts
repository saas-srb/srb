/**
 * What the model may return for one section, and how that becomes PBDoc blocks. Pure and client-safe.
 *
 * The model fills a strict JSON schema (no free-form HTML, no other node types): headings, paragraphs, clauses, bullet and numbered lists,
 * a callout, and a table. Text is a list of runs: plain `text`, a `var` (a fact by key, never typed out) or a `placeholder` (a gap the
 * author must fill). `outputToBlocks` turns that into raw PBDoc blocks, refusing unknown fact keys (they become placeholders) and
 * returning what it had to change; the PBDoc validator then has the last word.
 */

import type { FactBag } from "@/lib/products/playbook-ai/ai/facts";
import { KIND_LABEL, checkText, type AllowSet, type GuardIssue, type GuardKind, type GuardOptions } from "@/lib/products/playbook-ai/ai/guard";

export const AI_BLOCK_TYPES = ["paragraph", "heading", "clause", "bullets", "numbered", "callout", "table"] as const;
export type AiBlockType = (typeof AI_BLOCK_TYPES)[number];
export const AI_CALLOUT_VARIANTS = ["info", "warning", "important", "none"] as const;

export interface AiInline { kind: "text" | "var" | "placeholder"; text: string; key: string; label: string; bold: boolean }
export interface AiBlock {
  type: AiBlockType;
  level: number;
  variant: (typeof AI_CALLOUT_VARIANTS)[number];
  text: AiInline[];
  items: AiInline[][];
  rows: AiInline[][][];
  header: boolean;
}
export interface AiSectionOutput { blocks: AiBlock[]; missing: { key: string; label: string }[] }

const INLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "text", "key", "label", "bold"],
  properties: {
    kind: { type: "string", enum: ["text", "var", "placeholder"], description: "text = words you write; var = a fact by its key; placeholder = a gap the author must fill." },
    text: { type: "string", description: "The words, for kind text. Empty for var and placeholder." },
    key: { type: "string", description: "For var: the exact fact key. For placeholder: a short snake_case name. Empty for text." },
    label: { type: "string", description: "For placeholder: what to enter, for example 'Notice period in days'. Empty otherwise." },
    bold: { type: "boolean", description: "Bold the run." },
  },
} as const;
const INLINES = { type: "array", items: INLINE_SCHEMA } as const;

/** The strict JSON schema sent as `text.format`. Every property is required (strict mode); unused ones are empty. */
export const SECTION_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["blocks", "missing"],
  properties: {
    blocks: {
      type: "array",
      description: "The section's content, in order.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "level", "variant", "text", "items", "rows", "header"],
        properties: {
          type: { type: "string", enum: [...AI_BLOCK_TYPES] },
          level: { type: "integer", description: "Heading level 2 to 4, or clause level 1 to 3. 0 for other types." },
          variant: { type: "string", enum: [...AI_CALLOUT_VARIANTS], description: "Callout style. 'none' for other types." },
          text: { ...INLINES, description: "Runs of a paragraph, heading, clause or callout. Empty for lists and tables." },
          items: { type: "array", items: INLINES, description: "List items, each a list of runs. Empty for other types." },
          rows: { type: "array", items: { type: "array", items: INLINES }, description: "Table rows, each a list of cells, each a list of runs. Empty for other types." },
          header: { type: "boolean", description: "True when the first table row is a header row." },
        },
      },
    },
    missing: {
      type: "array",
      description: "Facts the section needs that were not provided.",
      items: { type: "object", additionalProperties: false, required: ["key", "label"], properties: { key: { type: "string" }, label: { type: "string" } } },
    },
  },
} as const;

export type RawNode = Record<string, unknown>;
export type RawBlock = Record<string, unknown>;

export interface ConvertResult {
  blocks: RawBlock[];
  /** Fact keys the model used as `var` nodes. */
  usedFacts: string[];
  /** Placeholders in the result (the model's own plus those made from unknown fact keys), by key. */
  placeholders: { key: string; label: string }[];
  /** Things changed or refused while converting. */
  problems: string[];
  /** Problems the model should be told about in a repair pass. */
  repairable: string[];
}

const PH_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const slug = (s: string, fallback: string) => {
  const x = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36);
  return /^[a-z]/.test(x) ? x : x ? `v_${x}`.slice(0, 40) : fallback;
};

const FORMAT_BY_KIND: Record<string, string> = { date: "date", money: "money", number: "number" };

function inlineToNodes(runs: unknown, bag: FactBag, ctx: { used: Set<string>; placeholders: Map<string, string>; problems: string[]; repairable: string[]; counter: { n: number } }): RawNode[] {
  const out: RawNode[] = [];
  if (!Array.isArray(runs)) return out;
  for (const r of runs as Partial<AiInline>[]) {
    const kind = r?.kind;
    const bold = r?.bold === true;
    const marks = bold ? [{ type: "bold" }] : undefined;
    if (kind === "var") {
      const key = typeof r.key === "string" ? r.key.trim() : "";
      const fact = bag.byKey.get(key);
      if (!fact) {
        ctx.problems.push(`"${key || "(empty)"}" is not a fact you were given`);
        ctx.repairable.push(`The fact "${key}" does not exist. Use only the keys listed in the facts, or a placeholder.`);
        const k = `add_${slug(key.split(".").pop() ?? key, `value_${++ctx.counter.n}`)}`;
        const label = `ADD: ${key.split(".").pop()?.replace(/_/g, " ") || "value"}`;
        ctx.placeholders.set(`input.${k}`, label);
        out.push({ type: "placeholder", key: `input.${k}`, label });
      } else {
        ctx.used.add(fact.key);
        const format = FORMAT_BY_KIND[fact.kind];
        out.push({ type: "var", key: fact.key, ...(format ? { format } : {}), ...(marks ? { marks } : {}) });
      }
    } else if (kind === "placeholder") {
      let k = typeof r.key === "string" ? r.key.trim().replace(/^input\./, "") : "";
      k = PH_KEY_RE.test(k) ? k : slug(k || (r.label ?? ""), `value_${++ctx.counter.n}`);
      const label = (typeof r.label === "string" && r.label.trim() ? r.label.trim() : k.replace(/_/g, " ")).slice(0, 120);
      ctx.placeholders.set(`input.${k}`, label);
      out.push({ type: "placeholder", key: `input.${k}`, label });
    } else if (kind === "text") {
      const text = typeof r.text === "string" ? r.text : "";
      if (text) out.push(marks ? { type: "text", text, marks } : { type: "text", text });
    } else {
      ctx.problems.push("a run had an unknown kind");
      ctx.repairable.push("Every run must have kind text, var or placeholder.");
    }
  }
  // Join neighbouring plain runs so the guard sees whole sentences.
  const merged: RawNode[] = [];
  for (const n of out) {
    const last = merged[merged.length - 1];
    if (last && last.type === "text" && n.type === "text" && JSON.stringify(last.marks ?? null) === JSON.stringify(n.marks ?? null)) last.text = `${last.text}${n.text}`;
    else merged.push({ ...n });
  }
  return merged;
}

/** Converts the model's output into raw PBDoc blocks (ids are assigned by the PBDoc parser). */
export function outputToBlocks(output: unknown, bag: FactBag): ConvertResult {
  const ctx = { used: new Set<string>(), placeholders: new Map<string, string>(), problems: [] as string[], repairable: [] as string[], counter: { n: 0 } };
  const blocks: RawBlock[] = [];
  const o = output as Partial<AiSectionOutput> | null;
  if (!o || !Array.isArray(o.blocks)) {
    return { blocks, usedFacts: [], placeholders: [], problems: ["the reply had no blocks"], repairable: ["Return an object with a blocks array."] };
  }
  const para = (runs: RawNode[]) => ({ type: "paragraph", content: runs });
  for (const b of o.blocks) {
    if (!b || typeof b !== "object") continue;
    const runs = () => inlineToNodes(b.text, bag, ctx);
    switch (b.type) {
      case "paragraph": { const c = runs(); if (c.length) blocks.push(para(c)); break; }
      case "heading": { const c = runs(); if (c.length) blocks.push({ type: "heading", level: Math.min(4, Math.max(2, Math.trunc(b.level) || 2)), content: c }); break; }
      case "clause": { const c = runs(); if (c.length) blocks.push({ type: "clause", level: Math.min(3, Math.max(1, Math.trunc(b.level) || 1)), numbered: true, content: c }); break; }
      case "bullets":
      case "numbered": {
        const items = (Array.isArray(b.items) ? b.items : []).map((it) => ({ content: [para(inlineToNodes(it, bag, ctx))] })).filter((i) => (i.content[0].content as RawNode[]).length);
        if (items.length) blocks.push(b.type === "bullets" ? { type: "bulletList", items } : { type: "orderedList", style: "decimal", items });
        break;
      }
      case "callout": {
        const c = runs();
        const variant = b.variant === "warning" || b.variant === "important" ? b.variant : "info";
        if (c.length) blocks.push({ type: "callout", variant, content: [para(c)] });
        break;
      }
      case "table": {
        const rows = (Array.isArray(b.rows) ? b.rows : []).map((r) => (Array.isArray(r) ? r : []).map((cell) => ({ content: [para(inlineToNodes(cell, bag, ctx))] })));
        const cols = Math.max(0, ...rows.map((r) => r.length));
        if (rows.length && cols >= 1 && cols <= 12) {
          const width = Math.floor(100 / cols);
          const colWidths = Array.from({ length: cols }, (_, i) => (i === cols - 1 ? 100 - width * (cols - 1) : width));
          blocks.push({ type: "table", colWidths, headerRow: b.header === true, rows: rows.map((r) => ({ cells: [...r, ...Array.from({ length: cols - r.length }, () => ({ content: [para([])] }))] })) });
        } else ctx.problems.push("a table had no usable rows");
        break;
      }
      default:
        ctx.problems.push(`unknown block type "${String((b as { type?: unknown }).type)}"`);
        ctx.repairable.push("Use only paragraph, heading, clause, bullets, numbered, callout or table blocks.");
    }
  }
  if (!blocks.length) { ctx.problems.push("the section was empty"); ctx.repairable.push("Write the section; it must not be empty."); }
  return { blocks, usedFacts: [...ctx.used], placeholders: [...ctx.placeholders].map(([key, label]) => ({ key, label })), problems: ctx.problems, repairable: ctx.repairable };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Guarding blocks
// ---------------------------------------------------------------------------------------------------------------------------------

/** Every inline list of a raw block, with whether it opens the block (for block numbering). */
function inlineLists(block: RawBlock, out: Array<{ nodes: RawNode[]; first: boolean }> = []): Array<{ nodes: RawNode[]; first: boolean }> {
  const kids = (v: unknown) => (Array.isArray(v) ? (v as RawBlock[]) : []);
  if (Array.isArray(block.content) && (block.type === "paragraph" || block.type === "heading" || block.type === "clause")) out.push({ nodes: block.content as RawNode[], first: true });
  if (block.type === "bulletList" || block.type === "orderedList") for (const i of kids(block.items)) for (const c of kids(i.content)) inlineLists(c, out);
  if (block.type === "table") for (const r of kids(block.rows)) for (const c of kids(r.cells)) for (const x of kids(c.content)) inlineLists(x, out);
  if (block.type === "callout") for (const c of kids(block.content)) inlineLists(c, out);
  return out;
}

export interface BlockGuardIssue extends GuardIssue { path: string }

/** Runs the fact guard over every text run of the blocks. */
export function guardBlocks(blocks: readonly RawBlock[], allow: AllowSet, opts?: GuardOptions): BlockGuardIssue[] {
  const issues: BlockGuardIssue[] = [];
  blocks.forEach((b, bi) => {
    inlineLists(b).forEach((l, li) => {
      l.nodes.forEach((n, ni) => {
        if (n.type !== "text" || typeof n.text !== "string") return;
        for (const i of checkText(n.text, allow, opts, ni === 0 && l.first)) issues.push({ ...i, path: `${bi}.${li}.${ni}` });
      });
    });
  });
  return issues;
}

/** Replaces every guard issue with a visible `[ADD: ...]` placeholder. Returns new blocks and the placeholders it made. */
export function scrubBlocks(blocks: readonly RawBlock[], allow: AllowSet, opts?: GuardOptions): { blocks: RawBlock[]; replaced: number; placeholders: { key: string; label: string }[] } {
  const copy = structuredClone(blocks) as RawBlock[];
  let n = 0;
  const made: { key: string; label: string }[] = [];
  copy.forEach((b) => {
    inlineLists(b).forEach((l) => {
      const next: RawNode[] = [];
      l.nodes.forEach((node, ni) => {
        if (node.type !== "text" || typeof node.text !== "string") { next.push(node); return; }
        const issues = checkText(node.text, allow, opts, ni === 0 && l.first);
        if (!issues.length) { next.push(node); return; }
        let at = 0;
        const text = node.text;
        for (const i of issues) {
          if (i.start < at) continue;
          if (i.start > at) next.push({ ...node, text: text.slice(at, i.start) });
          n++;
          const key = `input.add_${i.kind}_${n}`;
          const label = `ADD: ${KIND_LABEL[i.kind as GuardKind]}`;
          made.push({ key, label });
          next.push({ type: "placeholder", key, label });
          at = i.end;
        }
        if (at < text.length) next.push({ ...node, text: text.slice(at) });
      });
      l.nodes.splice(0, l.nodes.length, ...next);
    });
  });
  return { blocks: copy, replaced: n, placeholders: made };
}

/** The text of raw blocks as a reader sees it (variables as {{key}}, placeholders as [Label]), for word counts and prompts. */
export function blocksText(blocks: readonly RawBlock[]): string {
  const out: string[] = [];
  const inline = (nodes: unknown) => (Array.isArray(nodes) ? (nodes as RawNode[]) : []).map((n) => (n.type === "text" ? String(n.text ?? "") : n.type === "var" ? `{{${String(n.key)}}}` : n.type === "placeholder" ? `[${String(n.label)}]` : "")).join("");
  const walk = (b: RawBlock) => {
    const kids = (v: unknown) => (Array.isArray(v) ? (v as RawBlock[]) : []);
    switch (b.type) {
      case "paragraph": case "heading": case "clause": out.push(inline(b.content)); break;
      case "bulletList": case "orderedList": for (const i of kids(b.items)) for (const c of kids(i.content)) { const t: string[] = []; const save = out.length; walk(c); t.push(...out.splice(save)); out.push(`- ${t.join(" ")}`); } break;
      case "table": for (const r of kids(b.rows)) out.push(kids(r.cells).map((c) => kids(c.content).map((x) => { const s = out.length; walk(x); return out.splice(s).join(" "); }).join(" ")).join(" | ")); break;
      case "callout": for (const c of kids(b.content)) walk(c); break;
      case "section": for (const c of kids(b.children)) walk(c); break;
      default: break;
    }
  };
  blocks.forEach(walk);
  return out.filter(Boolean).join("\n\n");
}

export const wordCountOf = (text: string): number => {
  const t = text.replace(/\{\{[^}]+\}\}/g, "x").trim();
  return t ? t.split(/\s+/).length : 0;
};
