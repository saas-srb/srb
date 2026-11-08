/**
 * PBDoc validation and normalisation. Pure, client-safe (the editor uses it too; the SERVER re-runs it on every save and is the
 * security boundary).
 *
 * `parseDoc(input)` takes untrusted JSON and returns either a clean, typed, normalised `PBDoc` (a whitelist COPY: unknown properties are
 * dropped, nothing from the input object is reused) or the full list of issues with JSON paths. Normalisation guarantees one canonical
 * shape so the same content always hashes the same:
 *   - adjacent text runs with identical marks are merged, empty runs removed, marks sorted and de-duplicated;
 *   - empty containers (cell, list item, callout) get one empty paragraph;
 *   - table column widths are rounded to sum to exactly 100;
 *   - missing ids are assigned (when `assignIds`), duplicate ids are an error.
 */

import {
  ALIGNS, AI_MODES, CALLOUT_VARIANTS, CONDITION_OPS, FIELD_KINDS, HIGHLIGHT_COLORS, LIST_STYLES, PARTY_ROLES, PBDOC_SCHEMA_VERSION, TEXT_COLORS,
  VARIABLE_FORMATS, VARIABLE_NAMESPACES,
} from "@/lib/products/playbook-ai/doc/types";
import type {
  Align, CellChild, Condition, ContentBlock, InlineNode, ListItem, ListItemChild, Mark, PBDoc, ParagraphBlock, TableBlock, ValidationIssue, ZoneBlock,
} from "@/lib/products/playbook-ai/doc/types";
import { DEFAULT_PAGE, validatePage } from "@/lib/products/playbook-ai/doc/page";
import { ALLOWED_LINK_SCHEMES, FILE_ID_RE, ID_RE, IDENT_RE, PBDOC_LIMITS as L, SECTION_KEY_RE, VAR_KEY_RE } from "@/lib/products/playbook-ai/doc/limits";
import { randomId, type IdFactory } from "@/lib/products/playbook-ai/doc/ids";

export interface ParseOptions {
  /** Assign an id to every block that lacks one (and replace duplicates). Without it a missing id is an error. Default false. */
  assignIds?: boolean;
  idFactory?: IdFactory;
}

export type ParseResult = { ok: true; doc: PBDoc } | { ok: false; issues: ValidationIssue[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Marks are applied in this order so equal formatting always serialises identically. */
export const MARK_ORDER = ["bold", "italic", "underline", "strike", "sup", "sub", "highlight", "color", "link"] as const;

class Parser {
  issues: ValidationIssue[] = [];
  nodes = 0;
  ids = new Set<string>();
  sectionKeys = new Set<string>();
  tocCount = 0;
  sections = 0;
  constructor(private opts: Required<Pick<ParseOptions, "assignIds">> & { idFactory: IdFactory }) {}

  err(path: string, message: string) {
    if (this.issues.length < 200) this.issues.push({ path, message });
  }

  count(path: string): boolean {
    if (++this.nodes > L.maxNodes) {
      if (this.nodes === L.maxNodes + 1) this.err(path, `the document has more than ${L.maxNodes} nodes`);
      return false;
    }
    return true;
  }

  newId(): string {
    let id = this.opts.idFactory();
    while (this.ids.has(id)) id = this.opts.idFactory();
    this.ids.add(id);
    return id;
  }

  id(o: Obj, path: string): string {
    const v = o.id;
    if (v === undefined || v === null || v === "") {
      if (this.opts.assignIds) return this.newId();
      this.err(`${path}.id`, "id is required");
      return this.newId();
    }
    if (typeof v !== "string" || !ID_RE.test(v)) {
      this.err(`${path}.id`, "id must be 1 to 64 letters, digits, hyphens or underscores");
      return this.newId();
    }
    if (this.ids.has(v)) {
      if (this.opts.assignIds) return this.newId();
      this.err(`${path}.id`, `duplicate id "${v}"`);
      return this.newId();
    }
    this.ids.add(v);
    return v;
  }

  str(o: Obj, key: string, path: string, max: number, opts: { required?: boolean; allowEmpty?: boolean } = {}): string {
    const v = o[key];
    if (v === undefined || v === null) {
      if (opts.required) this.err(`${path}.${key}`, `${key} is required`);
      return "";
    }
    if (typeof v !== "string") {
      this.err(`${path}.${key}`, `${key} must be text`);
      return "";
    }
    if (v.length > max) {
      this.err(`${path}.${key}`, `${key} is longer than ${max} characters`);
      return v.slice(0, max);
    }
    if (opts.required && !opts.allowEmpty && v.trim() === "") this.err(`${path}.${key}`, `${key} must not be empty`);
    return v;
  }

  bool(o: Obj, key: string, path: string, dflt: boolean): boolean {
    const v = o[key];
    if (v === undefined || v === null) return dflt;
    if (typeof v !== "boolean") {
      this.err(`${path}.${key}`, `${key} must be true or false`);
      return dflt;
    }
    return v;
  }

  align(o: Obj, path: string): Align | undefined {
    const v = o.align;
    if (v === undefined || v === null) return undefined;
    if (!oneOf(ALIGNS, v)) {
      this.err(`${path}.align`, `align must be one of ${ALIGNS.join(", ")}`);
      return undefined;
    }
    return v;
  }

  // ---- variables and conditions ------------------------------------------------------------------------------------

  varKey(v: unknown, path: string, scope: string[]): string {
    if (typeof v !== "string" || !VAR_KEY_RE.test(v)) {
      this.err(path, "a variable key looks like company.legal_name (lower-case, dot-separated)");
      return typeof v === "string" ? v.slice(0, 120) : "";
    }
    const ns = v.split(".")[0];
    if (!(VARIABLE_NAMESPACES as readonly string[]).includes(ns) && !scope.includes(ns)) {
      this.err(path, `unknown variable namespace "${ns}" (allowed: ${VARIABLE_NAMESPACES.join(", ")}${scope.length ? `, ${scope.join(", ")}` : ""})`);
    }
    return v;
  }

  // ---- marks and inline --------------------------------------------------------------------------------------------

  marks(v: unknown, path: string, allowLink: boolean): Mark[] | undefined {
    if (v === undefined || v === null) return undefined;
    if (!Array.isArray(v)) {
      this.err(path, "marks must be a list");
      return undefined;
    }
    if (v.length > 12) this.err(path, "too many marks on one run");
    const byType = new Map<string, Mark>();
    v.slice(0, 12).forEach((m, i) => {
      const p = `${path}[${i}]`;
      if (!isObj(m) || typeof m.type !== "string") return this.err(p, "a mark needs a type");
      switch (m.type) {
        case "bold": case "italic": case "underline": case "strike": case "sup": case "sub":
          byType.set(m.type, { type: m.type });
          break;
        case "link": {
          if (!allowLink) return this.err(p, "links are only allowed on text");
          const href = typeof m.href === "string" ? m.href.trim() : "";
          if (!href || href.length > L.maxHref) return this.err(`${p}.href`, `a link needs an address of up to ${L.maxHref} characters`);
          let ok = false;
          try { ok = (ALLOWED_LINK_SCHEMES as readonly string[]).includes(new URL(href).protocol); } catch { ok = false; }
          if (!ok) return this.err(`${p}.href`, `a link must start with ${ALLOWED_LINK_SCHEMES.join(" ")}`);
          byType.set("link", { type: "link", href });
          break;
        }
        case "highlight":
          if (!oneOf(HIGHLIGHT_COLORS, m.color)) return this.err(`${p}.color`, `highlight must be one of ${HIGHLIGHT_COLORS.join(", ")}`);
          byType.set("highlight", { type: "highlight", color: m.color });
          break;
        case "color":
          if (!oneOf(TEXT_COLORS, m.color)) return this.err(`${p}.color`, `colour must be one of ${TEXT_COLORS.join(", ")}`);
          byType.set("color", { type: "color", color: m.color });
          break;
        default:
          this.err(p, `unknown mark "${m.type}"`);
      }
    });
    if (byType.has("sup") && byType.has("sub")) {
      this.err(path, "a run cannot be both superscript and subscript");
      byType.delete("sub");
    }
    const out = MARK_ORDER.map((t) => byType.get(t)).filter((m): m is Mark => !!m);
    return out.length ? out : undefined;
  }

  inline(v: unknown, path: string, scope: string[]): InlineNode[] {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      this.err(path, "content must be a list of inline nodes");
      return [];
    }
    if (v.length > L.maxInlinePerBlock) {
      this.err(path, `more than ${L.maxInlinePerBlock} inline nodes in one block`);
      return [];
    }
    const out: InlineNode[] = [];
    v.forEach((n, i) => {
      const p = `${path}[${i}]`;
      if (!this.count(p)) return;
      if (!isObj(n) || typeof n.type !== "string") return this.err(p, "an inline node needs a type");
      switch (n.type) {
        case "text": {
          const text = this.str(n, "text", p, L.maxText);
          const marks = this.marks(n.marks, `${p}.marks`, true);
          out.push(marks ? { type: "text", text, marks } : { type: "text", text });
          break;
        }
        case "var": {
          const key = this.varKey(n.key, `${p}.key`, scope);
          const node: InlineNode = { type: "var", key };
          if (n.format !== undefined && n.format !== null) {
            if (oneOf(VARIABLE_FORMATS, n.format)) node.format = n.format;
            else this.err(`${p}.format`, `format must be one of ${VARIABLE_FORMATS.join(", ")}`);
          }
          const fb = this.str(n, "fallback", p, L.maxFallback);
          if (fb) node.fallback = fb;
          const marks = this.marks(n.marks, `${p}.marks`, false);
          if (marks) node.marks = marks;
          out.push(node);
          break;
        }
        case "placeholder": {
          const key = this.varKey(n.key, `${p}.key`, scope);
          const label = this.str(n, "label", p, L.maxLabel, { required: true });
          const hint = this.str(n, "hint", p, L.maxHint);
          out.push(hint ? { type: "placeholder", key, label, hint } : { type: "placeholder", key, label });
          break;
        }
        case "field": {
          if (!oneOf(FIELD_KINDS, n.field)) return this.err(`${p}.field`, `field must be one of ${FIELD_KINDS.join(", ")}`);
          const marks = this.marks(n.marks, `${p}.marks`, false);
          out.push(marks ? { type: "field", field: n.field, marks } : { type: "field", field: n.field });
          break;
        }
        case "hardBreak":
          out.push({ type: "hardBreak" });
          break;
        default:
          this.err(p, `unknown inline node "${n.type}"`);
      }
    });
    return mergeInline(out);
  }

  // ---- blocks ------------------------------------------------------------------------------------------------------

  paragraph(o: Obj, path: string, scope: string[]): ParagraphBlock {
    const id = this.id(o, path);
    const align = this.align(o, path);
    const b: ParagraphBlock = { id, type: "paragraph", content: this.inline(o.content, `${path}.content`, scope) };
    if (align) b.align = align;
    return b;
  }

  emptyParagraph(): ParagraphBlock {
    return { id: this.newId(), type: "paragraph", content: [] };
  }

  list(o: Obj, path: string, scope: string[], depth: number): ListItemChild {
    const id = this.id(o, path);
    const isBullet = o.type === "bulletList";
    const items = this.items(o.items, `${path}.items`, scope, depth);
    if (isBullet) return { id, type: "bulletList", items };
    let style: "decimal" | "alpha" | "roman" = "decimal";
    if (o.style !== undefined && o.style !== null) {
      if (oneOf(LIST_STYLES, o.style)) style = o.style;
      else this.err(`${path}.style`, `style must be one of ${LIST_STYLES.join(", ")}`);
    }
    const out: ListItemChild = { id, type: "orderedList", style, items };
    if (o.start !== undefined && o.start !== null) {
      if (typeof o.start === "number" && Number.isInteger(o.start) && o.start >= 1 && o.start <= 9999) out.start = o.start;
      else this.err(`${path}.start`, "start must be a whole number from 1 to 9999");
    }
    return out;
  }

  items(v: unknown, path: string, scope: string[], depth: number): ListItem[] {
    if (depth > L.maxListDepth) {
      this.err(path, `lists are nested more than ${L.maxListDepth} levels`);
      return [];
    }
    if (!Array.isArray(v) || v.length === 0) {
      this.err(path, "a list needs at least one item");
      return [];
    }
    if (v.length > L.maxListItems) {
      this.err(path, `a list has more than ${L.maxListItems} items`);
      return [];
    }
    const out: ListItem[] = [];
    v.forEach((it, i) => {
      const p = `${path}[${i}]`;
      if (!this.count(p)) return;
      if (!isObj(it)) return this.err(p, "a list item must be an object");
      const id = this.id(it, p);
      const content = this.children(it.content, `${p}.content`, scope, L.maxCellBlocks, (o, cp) => this.listChild(o, cp, scope, depth + 1));
      out.push({ id, content: content.length ? content : [this.emptyParagraph()] });
    });
    return out;
  }

  listChild(o: Obj, path: string, scope: string[], depth: number): ListItemChild | null {
    if (o.type === "paragraph") return this.paragraph(o, path, scope);
    if (o.type === "bulletList" || o.type === "orderedList") return this.list(o, path, scope, depth);
    this.err(path, `a list item can hold paragraphs and lists, not "${String(o.type)}"`);
    return null;
  }

  cellChild(o: Obj, path: string, scope: string[]): CellChild | null {
    if (o.type === "paragraph") return this.paragraph(o, path, scope);
    if (o.type === "bulletList" || o.type === "orderedList") return this.list(o, path, scope, 1);
    this.err(path, `this container can hold paragraphs and lists, not "${String(o.type)}"`);
    return null;
  }

  children<T>(v: unknown, path: string, _scope: string[], max: number, one: (o: Obj, path: string) => T | null): T[] {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      this.err(path, "content must be a list");
      return [];
    }
    if (v.length > max) {
      this.err(path, `more than ${max} blocks here`);
      return [];
    }
    const out: T[] = [];
    v.forEach((c, i) => {
      const p = `${path}[${i}]`;
      if (!this.count(p)) return;
      if (!isObj(c) || typeof c.type !== "string") return this.err(p, "a block needs a type");
      const r = one(c, p);
      if (r) out.push(r);
    });
    return out;
  }

  table(o: Obj, path: string, scope: string[]): TableBlock {
    const id = this.id(o, path);
    const rowsIn = Array.isArray(o.rows) ? o.rows : [];
    if (!Array.isArray(o.rows) || rowsIn.length === 0) this.err(`${path}.rows`, "a table needs at least one row");
    if (rowsIn.length > L.maxTableRows) this.err(`${path}.rows`, `a table has more than ${L.maxTableRows} rows`);
    const rows: TableBlock["rows"] = [];
    let cols = -1;
    rowsIn.slice(0, L.maxTableRows).forEach((r, ri) => {
      const rp = `${path}.rows[${ri}]`;
      if (!this.count(rp)) return;
      if (!isObj(r)) return this.err(rp, "a row must be an object");
      const rid = this.id(r, rp);
      const cellsIn = Array.isArray(r.cells) ? r.cells : [];
      if (cellsIn.length === 0) this.err(`${rp}.cells`, "a row needs at least one cell");
      if (cellsIn.length > L.maxTableCols) this.err(`${rp}.cells`, `a table has more than ${L.maxTableCols} columns`);
      if (cols === -1) cols = cellsIn.length;
      else if (cellsIn.length !== cols) this.err(`${rp}.cells`, `every row needs ${cols} cells (merged cells are not supported)`);
      const cells = cellsIn.slice(0, L.maxTableCols).map((c, ci): TableBlock["rows"][number]["cells"][number] => {
        const cp = `${rp}.cells[${ci}]`;
        this.count(cp);
        if (!isObj(c)) {
          this.err(cp, "a cell must be an object");
          return { id: this.newId(), content: [this.emptyParagraph()] };
        }
        const cid = this.id(c, cp);
        const content = this.children(c.content, `${cp}.content`, scope, L.maxCellBlocks, (x, xp) => this.cellChild(x, xp, scope));
        const align = this.align(c, cp);
        const cell: TableBlock["rows"][number]["cells"][number] = { id: cid, content: content.length ? content : [this.emptyParagraph()] };
        if (align) cell.align = align;
        return cell;
      });
      rows.push({ id: rid, cells });
    });
    const n = Math.max(cols, 0);
    const colWidths = this.colWidths(o.colWidths, n, `${path}.colWidths`);
    return { id, type: "table", colWidths, headerRow: this.bool(o, "headerRow", path, true), rows };
  }

  colWidths(v: unknown, n: number, path: string): number[] {
    const equal = () => normalisePercents(Array.from({ length: n }, () => 100 / Math.max(n, 1)));
    if (v === undefined || v === null) return equal();
    if (!Array.isArray(v) || v.length !== n || v.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
      this.err(path, `colWidths needs ${n} numbers (percentages)`);
      return equal();
    }
    if ((v as number[]).some((x) => x < L.minColPct || x > 100)) {
      this.err(path, `every column must be between ${L.minColPct}% and 100%`);
      return equal();
    }
    const sum = (v as number[]).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 1) {
      this.err(path, `column widths must add up to 100 (they add up to ${Math.round(sum * 10) / 10})`);
      return equal();
    }
    return normalisePercents(v as number[]);
  }

  condition(v: unknown, path: string, scope: string[]): Condition {
    const o = isObj(v) ? v : {};
    if (!isObj(v)) this.err(path, "a condition is required");
    const key = this.varKey(o.key, `${path}.key`, scope);
    const op = oneOf(CONDITION_OPS, o.op) ? o.op : "exists";
    if (!oneOf(CONDITION_OPS, o.op)) this.err(`${path}.op`, `op must be one of ${CONDITION_OPS.join(", ")}`);
    const needsValue = op === "eq" || op === "neq" || op === "gt" || op === "lt";
    const value = this.str(o, "value", path, L.maxConditionValue);
    if (needsValue && o.value === undefined) this.err(`${path}.value`, `${op} needs a value`);
    if (!needsValue && o.value !== undefined && o.value !== null) this.err(`${path}.value`, `${op} does not take a value`);
    if ((op === "gt" || op === "lt") && value !== "" && !Number.isFinite(Number(value))) this.err(`${path}.value`, `${op} needs a number`);
    return needsValue ? { key, op, value } : { key, op };
  }

  /** `topLevel`: directly in the body (sections allowed). `depth`: container nesting. `scope`: enclosing repeat item variables. */
  content(v: unknown, path: string, scope: string[], depth: number, topLevel: boolean, max = L.maxBodyBlocks): ContentBlock[] {
    return this.children(v, path, scope, max, (o, p) => this.contentBlock(o, p, scope, depth, topLevel));
  }

  contentBlock(o: Obj, p: string, scope: string[], depth: number, topLevel: boolean): ContentBlock | null {
    switch (o.type) {
      case "paragraph": return this.paragraph(o, p, scope);
      case "heading": {
        const id = this.id(o, p);
        const level = o.level;
        if (level !== 1 && level !== 2 && level !== 3 && level !== 4) this.err(`${p}.level`, "level must be 1, 2, 3 or 4");
        const align = this.align(o, p);
        const b: ContentBlock = { id, type: "heading", level: level === 1 || level === 2 || level === 3 || level === 4 ? level : 2, content: this.inline(o.content, `${p}.content`, scope) };
        if (align) b.align = align;
        return b;
      }
      case "clause": {
        const id = this.id(o, p);
        const level = o.level;
        if (level !== 1 && level !== 2 && level !== 3) this.err(`${p}.level`, "level must be 1, 2 or 3");
        return { id, type: "clause", level: level === 1 || level === 2 || level === 3 ? level : 1, numbered: this.bool(o, "numbered", p, true), content: this.inline(o.content, `${p}.content`, scope) };
      }
      case "bulletList":
      case "orderedList":
        return this.list(o, p, scope, 1) as ContentBlock;
      case "table": return this.table(o, p, scope);
      case "image": return this.image(o, p);
      case "callout": {
        const id = this.id(o, p);
        if (!oneOf(CALLOUT_VARIANTS, o.variant)) this.err(`${p}.variant`, `variant must be one of ${CALLOUT_VARIANTS.join(", ")}`);
        const content = this.children(o.content, `${p}.content`, scope, L.maxCalloutBlocks, (x, xp) => this.cellChild(x, xp, scope));
        return { id, type: "callout", variant: oneOf(CALLOUT_VARIANTS, o.variant) ? o.variant : "info", content: content.length ? content : [this.emptyParagraph()] };
      }
      case "signatureBlock": {
        const id = this.id(o, p);
        if (!oneOf(PARTY_ROLES, o.partyRole)) this.err(`${p}.partyRole`, `partyRole must be one of ${PARTY_ROLES.join(", ")}`);
        return {
          id, type: "signatureBlock", label: this.str(o, "label", p, L.maxLabel, { required: true }),
          partyRole: oneOf(PARTY_ROLES, o.partyRole) ? o.partyRole : "counterparty",
          showName: this.bool(o, "showName", p, true), showDesignation: this.bool(o, "showDesignation", p, true), showDate: this.bool(o, "showDate", p, true),
        };
      }
      case "pageBreak": return { id: this.id(o, p), type: "pageBreak" };
      case "divider": return { id: this.id(o, p), type: "divider" };
      case "spacer": {
        const id = this.id(o, p);
        const h = o.heightMm;
        if (typeof h !== "number" || !Number.isFinite(h) || h < 1 || h > L.maxSpacerMm) this.err(`${p}.heightMm`, `heightMm must be from 1 to ${L.maxSpacerMm}`);
        return { id, type: "spacer", heightMm: typeof h === "number" && Number.isFinite(h) ? Math.min(Math.max(Math.round(h * 10) / 10, 1), L.maxSpacerMm) : 5 };
      }
      case "toc": {
        const id = this.id(o, p);
        if (++this.tocCount > 1) this.err(p, "a document can have only one table of contents");
        const lv = o.levels;
        if (lv !== 1 && lv !== 2 && lv !== 3 && lv !== 4) this.err(`${p}.levels`, "levels must be 1, 2, 3 or 4");
        return { id, type: "toc", levels: lv === 1 || lv === 2 || lv === 3 || lv === 4 ? lv : 3 };
      }
      case "conditional": {
        const id = this.id(o, p);
        if (depth >= L.maxContainerDepth) { this.err(p, `sections and conditions are nested more than ${L.maxContainerDepth} levels`); return null; }
        const when = this.condition(o.when, `${p}.when`, scope);
        return { id, type: "conditional", when, children: this.content(o.children, `${p}.children`, scope, depth + 1, false) };
      }
      case "repeat": {
        const id = this.id(o, p);
        if (depth >= L.maxContainerDepth) { this.err(p, `sections and conditions are nested more than ${L.maxContainerDepth} levels`); return null; }
        const source = this.varKey(o.source, `${p}.source`, scope);
        const itemVar = typeof o.itemVar === "string" && IDENT_RE.test(o.itemVar) ? o.itemVar : "";
        if (!itemVar) this.err(`${p}.itemVar`, "itemVar must be a lower-case name such as item");
        else if ((VARIABLE_NAMESPACES as readonly string[]).includes(itemVar)) this.err(`${p}.itemVar`, `itemVar cannot reuse the reserved name "${itemVar}"`);
        return { id, type: "repeat", source, itemVar: itemVar || "item", children: this.content(o.children, `${p}.children`, itemVar ? [...scope, itemVar] : scope, depth + 1, false) };
      }
      case "section": {
        const id = this.id(o, p);
        if (!topLevel) { this.err(p, "a section can only sit directly in the document body"); return null; }
        if (++this.sections > L.maxSections) this.err(p, `more than ${L.maxSections} sections`);
        const key = typeof o.key === "string" && SECTION_KEY_RE.test(o.key) ? o.key : "";
        if (!key) this.err(`${p}.key`, "a section key is a lower-case name such as scope or compensation");
        else if (this.sectionKeys.has(key)) this.err(`${p}.key`, `duplicate section key "${key}"`);
        else this.sectionKeys.add(key);
        if (!oneOf(AI_MODES, o.aiMode)) this.err(`${p}.aiMode`, `aiMode must be one of ${AI_MODES.join(", ")}`);
        return {
          id, type: "section", key: key || `section_${this.sections}`, title: this.str(o, "title", p, L.maxTitle, { required: true }),
          aiMode: oneOf(AI_MODES, o.aiMode) ? o.aiMode : "fixed", locked: this.bool(o, "locked", p, false),
          children: this.content(o.children, `${p}.children`, scope, depth + 1, false),
        };
      }
      default:
        this.err(p, `unknown block type "${String(o.type)}"`);
        return null;
    }
  }

  image(o: Obj, p: string): ContentBlockImage {
    const id = this.id(o, p);
    const fileId = typeof o.fileId === "string" && FILE_ID_RE.test(o.fileId) ? o.fileId : "";
    if (!fileId) this.err(`${p}.fileId`, "an image needs the id of an uploaded file");
    const w = o.widthPct;
    if (typeof w !== "number" || !Number.isFinite(w) || w < 5 || w > 100) this.err(`${p}.widthPct`, "widthPct must be from 5 to 100");
    const align = o.align === "left" || o.align === "center" || o.align === "right" ? o.align : "left";
    if (o.align !== undefined && o.align !== align) this.err(`${p}.align`, "align must be left, center or right");
    const b: ContentBlockImage = {
      id, type: "image", fileId, alt: this.str(o, "alt", p, L.maxAlt, { required: true }),
      widthPct: typeof w === "number" && Number.isFinite(w) ? Math.min(Math.max(Math.round(w * 10) / 10, 5), 100) : 100, align,
    };
    const caption = this.str(o, "caption", p, L.maxCaption);
    if (caption) b.caption = caption;
    return b;
  }

  zone(v: unknown, path: string): ZoneBlock[] {
    return this.children(v, path, [], L.maxZoneBlocks, (o, p): ZoneBlock | null => {
      switch (o.type) {
        case "paragraph": return this.paragraph(o, p, []);
        case "image": return this.image(o, p);
        case "divider": return { id: this.id(o, p), type: "divider" };
        case "table": return this.table(o, p, []);
        default:
          this.err(p, `a header or footer can hold paragraphs, images, dividers and tables, not "${String(o.type)}"`);
          return null;
      }
    });
  }
}

type ContentBlockImage = Extract<ContentBlock, { type: "image" }>;

/** Rounds to one decimal and puts the rounding remainder on the largest column so the total is exactly 100. */
export function normalisePercents(v: number[]): number[] {
  if (v.length === 0) return [];
  const r = v.map((x) => Math.round(x * 10) / 10);
  const diff = Math.round((100 - r.reduce((a, b) => a + b, 0)) * 10) / 10;
  if (diff !== 0) {
    let at = 0;
    r.forEach((x, i) => { if (x > r[at]) at = i; });
    r[at] = Math.round((r[at] + diff) * 10) / 10;
  }
  return r;
}

const marksKey = (m?: Mark[]) => (m && m.length ? JSON.stringify(m) : "");

/** Merges adjacent text runs with identical marks, drops empty runs, and removes a hard break at the very start or end. */
export function mergeInline(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    if (n.type === "text") {
      if (n.text === "") continue;
      const last = out[out.length - 1];
      if (last && last.type === "text" && marksKey(last.marks) === marksKey(n.marks)) {
        out[out.length - 1] = n.marks ? { type: "text", text: last.text + n.text, marks: n.marks } : { type: "text", text: last.text + n.text };
        continue;
      }
    }
    out.push(n);
  }
  while (out.length && out[out.length - 1].type === "hardBreak") out.pop();
  while (out.length && out[0].type === "hardBreak") out.shift();
  return out;
}

export function parseDoc(input: unknown, options: ParseOptions = {}): ParseResult {
  const p = new Parser({ assignIds: options.assignIds ?? false, idFactory: options.idFactory ?? randomId });
  if (!isObj(input)) return { ok: false, issues: [{ path: "", message: "the document must be an object" }] };
  if (input.schemaVersion !== PBDOC_SCHEMA_VERSION) p.err("schemaVersion", `schemaVersion must be ${PBDOC_SCHEMA_VERSION}`);
  if (input.lang !== undefined && input.lang !== "en") p.err("lang", 'lang must be "en"');
  const page = validatePage(input.page);
  if (!page.ok) page.errors.forEach((m) => p.err("page", m));
  const header = p.zone(input.header, "header");
  const footer = p.zone(input.footer, "footer");
  if (!Array.isArray(input.body)) p.err("body", "body must be a list of blocks");
  const body = p.content(input.body, "body", [], 0, true);
  if (p.issues.length) return { ok: false, issues: p.issues };
  return { ok: true, doc: { schemaVersion: PBDOC_SCHEMA_VERSION, lang: "en", page: (page as { ok: true; value: PBDoc["page"] }).value, header, footer, body } };
}

/** Normalises an already-typed document (idempotent): runs it through `parseDoc` again. Throws if the document is invalid. */
export function normalizeDoc(doc: PBDoc, options: ParseOptions = {}): PBDoc {
  const r = parseDoc(doc, options);
  if (!r.ok) throw new Error(`invalid document: ${r.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  return r.doc;
}

/** An empty, valid A4 document with default page settings. */
export function emptyDoc(idFactory: IdFactory = randomId): PBDoc {
  const r = parseDoc({ schemaVersion: PBDOC_SCHEMA_VERSION, lang: "en", page: DEFAULT_PAGE, header: [], footer: [], body: [{ type: "paragraph", content: [] }] }, { assignIds: true, idFactory });
  if (!r.ok) throw new Error("emptyDoc: the default document is invalid");
  return r.doc;
}
