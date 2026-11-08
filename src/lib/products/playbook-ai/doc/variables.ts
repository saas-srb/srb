/**
 * Variables, placeholders, conditionals and repeats: detection and resolution. Pure, client-safe.
 *
 * Variables are inline nodes (`{type:"var", key}`), never text to regex over. Conditionals and repeats are structured nodes with a
 * structured condition: there is no expression language and nothing is evaluated as code. `resolveDoc` returns a NEW document; callers
 * freeze the resolved values with the version (the variable snapshot) so a later change to company data cannot alter an issued document.
 */

import type {
  AnyBlock, Condition, ContentBlock, InlineNode, ListItem, PBDoc, TableBlock, VariableFormat, ZoneBlock,
} from "@/lib/products/playbook-ai/doc/types";
import { allBlocks, inlineOf } from "@/lib/products/playbook-ai/doc/walk";
import { formatValue } from "@/lib/products/playbook-ai/doc/format";
import { parseDoc, mergeInline } from "@/lib/products/playbook-ai/doc/validate";
import { randomId, type IdFactory } from "@/lib/products/playbook-ai/doc/ids";

export type VarValue = string | number | boolean | null | undefined;
export type VarValues = Record<string, VarValue>;
/** Items for `repeat` blocks, keyed by the repeat's `source`. Each item is a flat or nested object of values. */
export type VarLists = Record<string, Array<Record<string, unknown>>>;

export interface VariableUse {
  key: string;
  formats: VariableFormat[];
  /** True when at least one use has no fallback. */
  needsValue: boolean;
}

export interface Collected {
  variables: VariableUse[];
  placeholders: { key: string; label: string; hint?: string }[];
  /** Keys read by conditions. */
  conditionKeys: string[];
  /** Sources of repeat blocks. */
  repeatSources: string[];
}

/** Everything a template or document asks for, with item variables of repeat blocks left out (they come from the list items). */
export function collectVariables(doc: PBDoc): Collected {
  const vars = new Map<string, { formats: Set<VariableFormat>; needsValue: boolean }>();
  const placeholders = new Map<string, { key: string; label: string; hint?: string }>();
  const conditionKeys = new Set<string>();
  const repeatSources = new Set<string>();
  const itemVars = new Set<string>();
  for (const b of allBlocks(doc)) if (b.type === "repeat") itemVars.add(b.itemVar);
  const isItem = (key: string) => itemVars.has(key.split(".")[0]);
  for (const b of allBlocks(doc)) {
    if (b.type === "conditional" && !isItem(b.when.key)) conditionKeys.add(b.when.key);
    if (b.type === "repeat") repeatSources.add(b.source);
    for (const n of inlineOf(b)) {
      if (n.type === "var" && !isItem(n.key)) {
        const e = vars.get(n.key) ?? { formats: new Set<VariableFormat>(), needsValue: false };
        e.formats.add(n.format ?? "text");
        if (!n.fallback) e.needsValue = true;
        vars.set(n.key, e);
      } else if (n.type === "placeholder" && !placeholders.has(n.key)) {
        placeholders.set(n.key, n.hint ? { key: n.key, label: n.label, hint: n.hint } : { key: n.key, label: n.label });
      }
    }
  }
  return {
    variables: [...vars].map(([key, e]) => ({ key, formats: [...e.formats].sort(), needsValue: e.needsValue })).sort((a, b) => a.key.localeCompare(b.key)),
    placeholders: [...placeholders.values()].sort((a, b) => a.key.localeCompare(b.key)),
    conditionKeys: [...conditionKeys].sort(),
    repeatSources: [...repeatSources].sort(),
  };
}

const present = (v: unknown): v is string | number | boolean => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");

/** Evaluates a structured condition against the values. Missing values never satisfy eq/gt/lt and always satisfy not_exists. */
export function evalCondition(c: Condition, lookup: (key: string) => unknown): boolean {
  const v = lookup(c.key);
  switch (c.op) {
    case "exists": return present(v);
    case "not_exists": return !present(v);
    case "eq": return present(v) && String(v) === (c.value ?? "");
    case "neq": return !present(v) || String(v) !== (c.value ?? "");
    case "gt":
    case "lt": {
      const a = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
      const b = Number(c.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return c.op === "gt" ? a > b : a < b;
    }
  }
}

export interface ResolveOptions {
  values: VarValues;
  lists?: VarLists;
  idFactory?: IdFactory;
}

export interface ResolveIssue { key: string; reason: string }

export interface ResolveResult {
  doc: PBDoc;
  /** Variables that stayed unresolved (no value, no fallback) or could not be formatted. They remain `var` nodes in `doc`. */
  unresolved: ResolveIssue[];
  /** Placeholders still present: the user must supply these before export. */
  placeholders: { key: string; label: string }[];
}

type Scope = { itemVar: string; item: Record<string, unknown> }[];

function lookupIn(values: VarValues, scope: Scope, key: string): unknown {
  const ns = key.split(".")[0];
  for (let i = scope.length - 1; i >= 0; i--) {
    if (scope[i].itemVar === ns) {
      let cur: unknown = scope[i].item;
      for (const part of key.split(".").slice(1)) {
        if (cur && typeof cur === "object" && part in (cur as object)) cur = (cur as Record<string, unknown>)[part];
        else return undefined;
      }
      return cur;
    }
  }
  return values[key];
}

const isScoped = (key: string, scope: Scope) => scope.some((s) => s.itemVar === key.split(".")[0]);

/**
 * Resolves variables, evaluates conditionals and expands repeats. A `var` with a value becomes plain text carrying its marks; one without
 * a value uses its fallback; otherwise it stays a `var` node and is reported in `unresolved`. A `placeholder` whose key has a value is
 * replaced by that value; the rest are reported.
 */
export function resolveDoc(doc: PBDoc, opts: ResolveOptions): ResolveResult {
  const idFactory = opts.idFactory ?? randomId;
  const unresolved = new Map<string, string>();
  const placeholders = new Map<string, string>();

  const resolveInline = (nodes: InlineNode[], scope: Scope): InlineNode[] => {
    const out: InlineNode[] = [];
    for (const n of nodes) {
      if (n.type === "var") {
        const raw = lookupIn(opts.values, scope, n.key);
        if (present(raw)) {
          const f = formatValue(raw, n.format ?? "text");
          if (f.ok) { out.push(n.marks ? { type: "text", text: f.text, marks: n.marks } : { type: "text", text: f.text }); continue; }
          if (n.fallback) { out.push(n.marks ? { type: "text", text: n.fallback, marks: n.marks } : { type: "text", text: n.fallback }); continue; }
          unresolved.set(n.key, f.reason);
          if (!isScoped(n.key, scope)) out.push(n);
        } else if (n.fallback) {
          out.push(n.marks ? { type: "text", text: n.fallback, marks: n.marks } : { type: "text", text: n.fallback });
        } else {
          if (!unresolved.has(n.key)) unresolved.set(n.key, "no value");
          // A repeat item's own variable cannot survive outside its repeat (its namespace would be unknown), so it is dropped and reported.
          if (!isScoped(n.key, scope)) out.push(n);
        }
      } else if (n.type === "placeholder") {
        const raw = lookupIn(opts.values, scope, n.key);
        if (present(raw)) out.push({ type: "text", text: String(raw) });
        else {
          placeholders.set(n.key, n.label);
          out.push(n);
        }
      } else out.push(n);
    }
    return mergeInline(out);
  };

  const cloneIds = (b: ContentBlock | ZoneBlock): void => {
    // Fresh ids for blocks produced by a repeat so the expanded document keeps unique ids.
    (b as { id: string }).id = idFactory();
    const kids: AnyBlock[] = [];
    if (b.type === "bulletList" || b.type === "orderedList") b.items.forEach((i: ListItem) => { i.id = idFactory(); kids.push(...i.content); });
    else if (b.type === "table") b.rows.forEach((r) => { r.id = idFactory(); r.cells.forEach((c) => { c.id = idFactory(); kids.push(...c.content); }); });
    else if (b.type === "callout") kids.push(...b.content);
    else if (b.type === "conditional" || b.type === "repeat" || b.type === "section") kids.push(...b.children);
    kids.forEach((k) => cloneIds(k as ContentBlock));
  };

  const resolveBlocks = <T extends ContentBlock | ZoneBlock>(blocks: T[], scope: Scope): T[] => {
    const out: T[] = [];
    for (const b of blocks) {
      if (b.type === "conditional") {
        if (evalCondition(b.when, (k) => lookupIn(opts.values, scope, k))) out.push(...(resolveBlocks(b.children, scope) as unknown as T[]));
        continue;
      }
      if (b.type === "repeat") {
        const items = opts.lists?.[b.source] ?? [];
        for (const item of items) {
          const copy = structuredClone(b.children) as ContentBlock[];
          copy.forEach(cloneIds);
          out.push(...(resolveBlocks(copy, [...scope, { itemVar: b.itemVar, item }]) as unknown as T[]));
        }
        continue;
      }
      out.push(resolveOne(b, scope));
    }
    return out;
  };

  const resolveItems = (items: ListItem[], scope: Scope): ListItem[] =>
    items.map((i) => ({ id: i.id, content: resolveBlocks(i.content, scope) }));

  const resolveOne = <T extends ContentBlock | ZoneBlock>(b: T, scope: Scope): T => {
    switch (b.type) {
      case "paragraph":
      case "heading":
      case "clause":
        return { ...b, content: resolveInline(b.content, scope) } as T;
      case "bulletList":
      case "orderedList":
        return { ...b, items: resolveItems(b.items, scope) } as T;
      case "table": {
        const t = b as TableBlock;
        return { ...t, rows: t.rows.map((r) => ({ id: r.id, cells: r.cells.map((c) => ({ ...c, content: resolveBlocks(c.content, scope) })) })) } as unknown as T;
      }
      case "callout":
        return { ...b, content: resolveBlocks(b.content, scope) } as T;
      case "section":
        return { ...b, children: resolveBlocks(b.children, scope) } as T;
      default:
        return b;
    }
  };

  const resolved: PBDoc = {
    ...doc,
    header: resolveBlocks(doc.header, []),
    footer: resolveBlocks(doc.footer, []),
    body: resolveBlocks(doc.body, []),
  };
  // Resolution can leave empty list items or cells; the parser restores the invariants and proves the result is still valid.
  const parsed = parseDoc(resolved, { assignIds: false, idFactory });
  if (!parsed.ok) throw new Error(`resolved document is invalid: ${parsed.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  return {
    doc: parsed.doc,
    unresolved: [...unresolved].map(([key, reason]) => ({ key, reason })).sort((a, b) => a.key.localeCompare(b.key)),
    placeholders: [...placeholders].map(([key, label]) => ({ key, label })).sort((a, b) => a.key.localeCompare(b.key)),
  };
}
