/**
 * Version comparison data: block diff by stable ids (added, removed, changed, moved) with a word diff inside changed text, plus page
 * settings and variable value changes. Pure and client-safe; the compare page and the redline view render this. Uses `diff` (pinned).
 */

import { diffWords } from "diff";
import type { AnyBlock, InlineNode, PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { childBlocks, inlineOf } from "@/lib/products/playbook-ai/doc/walk";
import { inlineText } from "@/lib/products/playbook-ai/doc/text";
import { collectVariables } from "@/lib/products/playbook-ai/doc/variables";

export type WordOp = "equal" | "add" | "remove";
export interface WordSegment { text: string; op: WordOp }
export type BlockChangeKind = "added" | "removed" | "changed" | "moved" | "unchanged";
export type DiffZone = "header" | "body" | "footer";

export interface AttrChange { attr: string; before: string; after: string }

export interface BlockDiffEntry {
  id: string;
  zone: DiffZone;
  blockType: string;
  kind: BlockChangeKind;
  /** True when the block also changed position or parent (kind is then `changed` if its content changed too). */
  moved: boolean;
  parentId: string | null;
  before: string | null;
  after: string | null;
  /** Word-level redline of the text; null when the text did not change or is too long to compare. */
  words: WordSegment[] | null;
  attrChanges: AttrChange[];
}

export interface VariableChange { key: string; before: string | null; after: string | null }

export interface DocDiff {
  identical: boolean;
  entries: BlockDiffEntry[];
  summary: { added: number; removed: number; changed: number; moved: number; unchanged: number };
  page: { changed: boolean; before: unknown; after: unknown };
  variableChanges: VariableChange[];
}

export interface DiffOptions {
  /** Resolved values of each side (version snapshots), to report variable value changes. */
  valuesBefore?: Record<string, string | number | boolean | null | undefined>;
  valuesAfter?: Record<string, string | number | boolean | null | undefined>;
  /** Skip the word diff for texts longer than this (characters). */
  maxWordDiffChars?: number;
}

interface Flat { id: string; block: AnyBlock; parentId: string | null; zone: DiffZone; text: string; attrs: Record<string, string>; inline: string }

const SKIP_ATTR = new Set(["id", "type", "content", "items", "rows", "children"]);

function ownText(b: AnyBlock): string {
  if (b.type === "paragraph" || b.type === "heading" || b.type === "clause") return inlineText(b.content);
  if (b.type === "image") return b.caption ? `[Image: ${b.alt}] ${b.caption}` : `[Image: ${b.alt}]`;
  if (b.type === "signatureBlock") return b.label;
  return "";
}

function ownAttrs(b: AnyBlock): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(b as unknown as Record<string, unknown>)) {
    if (SKIP_ATTR.has(k) || v === undefined) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  if (b.type === "bulletList" || b.type === "orderedList") out.items = String(b.items.length);
  if (b.type === "table") out.shape = b.rows.map((r) => r.cells.length).join(",");
  return out;
}

function flatten(zone: DiffZone, blocks: readonly AnyBlock[], parentId: string | null, out: Flat[]): void {
  for (const b of blocks) {
    const inl: InlineNode[] = inlineOf(b);
    out.push({ id: b.id, block: b, parentId, zone, text: ownText(b), attrs: ownAttrs(b), inline: JSON.stringify(inl) });
    flatten(zone, childBlocks(b), b.id, out);
  }
}

function flatZone(zone: DiffZone, blocks: readonly AnyBlock[]): Flat[] {
  const out: Flat[] = [];
  flatten(zone, blocks, null, out);
  return out;
}

/** Positions (in `seq`) that are NOT part of a longest increasing subsequence: the items that moved. O(n log n). */
function movedPositions(seq: number[]): Set<number> {
  const tails: number[] = [];
  const tailIdx: number[] = [];
  const prev: number[] = new Array(seq.length).fill(-1);
  seq.forEach((v, i) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < v) lo = mid + 1; else hi = mid; }
    tails[lo] = v;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  });
  const keep = new Set<number>();
  let k = tailIdx.length ? tailIdx[tailIdx.length - 1] : -1;
  while (k >= 0) { keep.add(k); k = prev[k]; }
  const moved = new Set<number>();
  seq.forEach((_, i) => { if (!keep.has(i)) moved.add(i); });
  return moved;
}

export function wordDiff(before: string, after: string, maxChars = 100_000): WordSegment[] | null {
  if (before === after) return null;
  if (before.length > maxChars || after.length > maxChars) return null;
  return diffWords(before, after).map((c) => ({ text: c.value, op: c.added ? "add" : c.removed ? "remove" : "equal" }) as WordSegment);
}

function diffZone(zone: DiffZone, a: PBDoc[DiffZone], b: PBDoc[DiffZone], maxChars: number): BlockDiffEntry[] {
  const A = flatZone(zone, a as readonly AnyBlock[]);
  const B = flatZone(zone, b as readonly AnyBlock[]);
  const aById = new Map(A.map((f) => [f.id, f]));
  const bById = new Map(B.map((f) => [f.id, f]));
  const aIndex = new Map(A.map((f, i) => [f.id, i]));
  // Blocks present on both sides, in the new order, as their old positions: the ones off the longest increasing run moved.
  const common = B.filter((f) => aById.has(f.id));
  const movedIdx = movedPositions(common.map((f) => aIndex.get(f.id)!));
  const movedIds = new Set<string>();
  common.forEach((f, i) => { if (movedIdx.has(i) || aById.get(f.id)!.parentId !== f.parentId) movedIds.add(f.id); });

  // Removed blocks are shown right after the closest earlier old block that survives, so the redline reads in order.
  const removedAfter = new Map<string | null, Flat[]>();
  let anchor: string | null = null;
  for (const f of A) {
    if (bById.has(f.id)) { anchor = f.id; continue; }
    const list = removedAfter.get(anchor) ?? [];
    list.push(f);
    removedAfter.set(anchor, list);
  }
  const removedEntry = (f: Flat): BlockDiffEntry => ({
    id: f.id, zone, blockType: f.block.type, kind: "removed", moved: false, parentId: f.parentId, before: f.text, after: null, words: null, attrChanges: [],
  });

  const out: BlockDiffEntry[] = (removedAfter.get(null) ?? []).map(removedEntry);
  for (const f of B) {
    const old = aById.get(f.id);
    if (!old) {
      out.push({ id: f.id, zone, blockType: f.block.type, kind: "added", moved: false, parentId: f.parentId, before: null, after: f.text, words: null, attrChanges: [] });
    } else {
      const attrChanges: AttrChange[] = [];
      for (const k of new Set([...Object.keys(old.attrs), ...Object.keys(f.attrs)])) {
        if (old.attrs[k] !== f.attrs[k]) attrChanges.push({ attr: k, before: old.attrs[k] ?? "", after: f.attrs[k] ?? "" });
      }
      if (old.text === f.text && old.inline !== f.inline) attrChanges.push({ attr: "formatting", before: "", after: "" });
      const textChanged = old.text !== f.text;
      const changed = textChanged || attrChanges.length > 0 || old.block.type !== f.block.type;
      const moved = movedIds.has(f.id);
      out.push({
        id: f.id, zone, blockType: f.block.type, kind: changed ? "changed" : moved ? "moved" : "unchanged", moved, parentId: f.parentId,
        before: old.text, after: f.text, words: textChanged ? wordDiff(old.text, f.text, maxChars) : null, attrChanges,
      });
    }
    for (const r of removedAfter.get(f.id) ?? []) out.push(removedEntry(r));
  }
  return out;
}

const show = (v: unknown): string | null => (v === undefined || v === null || v === "" ? null : String(v));

export function diffDocs(a: PBDoc, b: PBDoc, opts: DiffOptions = {}): DocDiff {
  const max = opts.maxWordDiffChars ?? 100_000;
  const entries = [...diffZone("header", a.header, b.header, max), ...diffZone("body", a.body, b.body, max), ...diffZone("footer", a.footer, b.footer, max)];
  const summary = { added: 0, removed: 0, changed: 0, moved: 0, unchanged: 0 };
  for (const e of entries) summary[e.kind]++;
  const pageChanged = JSON.stringify(a.page) !== JSON.stringify(b.page);

  const variableChanges: VariableChange[] = [];
  const keys = new Set([...collectVariables(a).variables.map((v) => v.key), ...collectVariables(b).variables.map((v) => v.key)]);
  for (const key of [...keys].sort()) {
    const before = show(opts.valuesBefore?.[key]);
    const after = show(opts.valuesAfter?.[key]);
    if (before !== after) variableChanges.push({ key, before, after });
  }
  const identical = !pageChanged && variableChanges.length === 0 && entries.every((e) => e.kind === "unchanged");
  return { identical, entries, summary, page: { changed: pageChanged, before: a.page, after: b.page }, variableChanges };
}

/** One line for the audit trail and version lists, e.g. "2 added, 1 changed, 1 page setting". */
export function summarizeDiff(d: DocDiff): string {
  const parts: string[] = [];
  if (d.summary.added) parts.push(`${d.summary.added} added`);
  if (d.summary.removed) parts.push(`${d.summary.removed} removed`);
  if (d.summary.changed) parts.push(`${d.summary.changed} changed`);
  if (d.summary.moved) parts.push(`${d.summary.moved} moved`);
  if (d.page.changed) parts.push("page settings changed");
  if (d.variableChanges.length) parts.push(`${d.variableChanges.length} variable value${d.variableChanges.length === 1 ? "" : "s"} changed`);
  return parts.length ? parts.join(", ") : "no changes";
}
