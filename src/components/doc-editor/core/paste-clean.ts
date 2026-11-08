/**
 * Paste cleaning: turns HTML from Word, Google Docs, web pages or email into a small, canonical HTML subset that the editor schema parses.
 * Pure string code (its own tokenizer, no DOM) so it runs in tests and never trusts the source. Anything the PBDoc model cannot draw is
 * dropped or flattened: scripts, styles, images, nested tables, merged cells, fonts, colours, classes, ids, inline event handlers.
 *
 * Output tags: p, h1-h4, strong, em, u, s, sup, sub, a[href], br, ul, ol[data-style,start], li, table, tr, th, td.
 */
import { safeHref } from "@/components/doc-editor/core/links";
import { PBDOC_LIMITS } from "@/lib/products/playbook-ai/doc/limits";

export const PASTE_LIMITS = { maxChars: 1_000_000, maxNodes: 60_000, maxDepth: 120, maxListDepth: PBDOC_LIMITS.maxListDepth } as const;

interface HNode { tag: string; attrs: Record<string, string>; children: HNode[]; text?: string; parent?: HNode }

const VOID = new Set(["br", "hr", "img", "meta", "link", "input", "col", "wbr", "area", "base", "source", "track", "embed", "param"]);
/** Elements whose whole content is discarded. */
const DROP = new Set(["script", "style", "head", "title", "xml", "template", "noscript", "iframe", "object", "embed", "svg", "math", "canvas", "audio", "video", "form", "select", "textarea", "button", "applet", "frameset", "map", "picture"]);
const BLOCK = new Set(["p", "div", "section", "article", "aside", "header", "footer", "nav", "main", "figure", "figcaption", "blockquote", "pre", "address", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "hr", "center", "fieldset", "details", "summary", "caption"]);

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", deg: "°", times: "×",
  rupee: "₹", euro: "€", pound: "£", sect: "§", para: "¶", laquo: "«", raquo: "»", shy: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,10});/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "";
      return String.fromCodePoint(cp);
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Removes control characters and zero-width characters that Word and the web leave in text. */
export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‍⁠﻿­]/g, "").replace(/ /g, " ");
}

// ---- tokenizer and tree ---------------------------------------------------------------------------------------------

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)((?:\s+[^\s=>/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/y;
const ATTR_RE = /([^\s=>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(src))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

const nearest = (n: HNode, pred: (t: string) => boolean, stop: (t: string) => boolean): HNode | null => {
  for (let c: HNode | undefined = n; c; c = c.parent) {
    if (pred(c.tag)) return c;
    if (stop(c.tag)) return null;
  }
  return null;
};

export function parseHtml(html: string): HNode {
  const root: HNode = { tag: "#root", attrs: {}, children: [] };
  let cur = root;
  let nodes = 0;
  let depth = 0;
  let i = 0;
  const n = html.length;
  let dropUntil: string | null = null;
  const pushText = (t: string) => {
    if (!t || dropUntil) return;
    if (++nodes > PASTE_LIMITS.maxNodes) return;
    cur.children.push({ tag: "#text", attrs: {}, children: [], text: t });
  };
  const closeTo = (target: HNode) => {
    while (cur !== target && cur.parent) { cur = cur.parent; depth--; }
    if (cur === target && cur.parent) { cur = cur.parent; depth--; }
  };
  while (i < n && nodes <= PASTE_LIMITS.maxNodes) {
    const lt = html.indexOf("<", i);
    if (lt === -1) { pushText(decodeEntities(html.slice(i))); break; }
    if (lt > i) pushText(decodeEntities(html.slice(i, lt)));
    i = lt;
    if (html.startsWith("<!--", i)) { const e = html.indexOf("-->", i + 4); i = e === -1 ? n : e + 3; continue; }
    if (html[i + 1] === "!" || html[i + 1] === "?") { const e = html.indexOf(">", i); i = e === -1 ? n : e + 1; continue; }
    TAG_RE.lastIndex = i;
    const m = TAG_RE.exec(html);
    if (!m) { pushText("<"); i++; continue; }
    i = TAG_RE.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (dropUntil) {
      if (closing && tag === dropUntil) dropUntil = null;
      continue;
    }
    if (closing) {
      let c: HNode | undefined = cur;
      while (c && c.parent && c.tag !== tag) c = c.parent;
      if (c && c.parent && c.tag === tag) closeTo(c);
      continue;
    }
    if (DROP.has(tag) || (tag.includes(":") && !tag.startsWith("o:"))) {
      if (!VOID.has(tag) && !m[4]) dropUntil = tag;
      continue;
    }
    // Implied end tags.
    if (tag === "li") { const li = nearest(cur, (t) => t === "li", (t) => t === "ul" || t === "ol"); if (li) closeTo(li); }
    else if (tag === "td" || tag === "th") { const c = nearest(cur, (t) => t === "td" || t === "th", (t) => t === "tr" || t === "table"); if (c) closeTo(c); }
    else if (tag === "tr") { const c = nearest(cur, (t) => t === "tr", (t) => t === "table"); if (c) closeTo(c); }
    else if (tag === "thead" || tag === "tbody" || tag === "tfoot") { const c = nearest(cur, (t) => t === "thead" || t === "tbody" || t === "tfoot", (t) => t === "table"); if (c) closeTo(c); }
    else if (BLOCK.has(tag) && cur.tag === "p") closeTo(cur);
    if (++nodes > PASTE_LIMITS.maxNodes) break;
    const el: HNode = { tag, attrs: parseAttrs(m[3]), children: [], parent: cur };
    cur.children.push(el);
    if (!VOID.has(tag) && !m[4]) {
      if (depth >= PASTE_LIMITS.maxDepth) continue;
      cur = el;
      depth++;
    }
  }
  return root;
}

// ---- style helpers --------------------------------------------------------------------------------------------------

function styleOf(el: HNode): Record<string, string> {
  const out: Record<string, string> = {};
  const s = el.attrs.style;
  if (!s) return out;
  for (const part of s.split(";")) {
    const k = part.indexOf(":");
    if (k > 0) out[part.slice(0, k).trim().toLowerCase()] = part.slice(k + 1).trim().toLowerCase().replace(/\s*!important/, "");
  }
  return out;
}

const isBoldWeight = (w: string | undefined) => !!w && (w === "bold" || w === "bolder" || (/^\d+$/.test(w) && Number(w) >= 600));
const isNormalWeight = (w: string | undefined) => !!w && (w === "normal" || w === "lighter" || (/^\d+$/.test(w) && Number(w) < 600));

type Mark = "strong" | "em" | "u" | "s" | "sup" | "sub";
interface Run { text?: string; br?: true; marks: Set<Mark>; href?: string }

function marksFor(el: HNode, inherited: Set<Mark>, inLink: boolean): Set<Mark> {
  const m = new Set(inherited);
  const st = styleOf(el);
  const tag = el.tag;
  if (tag === "b" || tag === "strong" || tag === "th") { if (!isNormalWeight(st["font-weight"]) && tag !== "th") m.add("strong"); }
  if (tag === "i" || tag === "em" || tag === "cite" || tag === "dfn" || tag === "var") m.add("em");
  if (tag === "u" || tag === "ins") m.add("u");
  if (tag === "s" || tag === "strike" || tag === "del") m.add("s");
  if (tag === "sup") { m.add("sup"); m.delete("sub"); }
  if (tag === "sub") { m.add("sub"); m.delete("sup"); }
  if (isBoldWeight(st["font-weight"])) m.add("strong");
  else if (isNormalWeight(st["font-weight"]) && tag !== "b" && tag !== "strong") m.delete("strong");
  if (isNormalWeight(st["font-weight"]) && (tag === "b" || tag === "strong")) m.delete("strong");
  const fs = st["font-style"];
  if (fs === "italic" || fs === "oblique") m.add("em"); else if (fs === "normal" && tag !== "i" && tag !== "em") m.delete("em");
  const deco = `${st["text-decoration"] ?? ""} ${st["text-decoration-line"] ?? ""}`;
  if (deco.includes("line-through")) m.add("s");
  if (deco.includes("underline") && !inLink) m.add("u");
  const va = st["vertical-align"];
  if (va === "super") { m.add("sup"); m.delete("sub"); } else if (va === "sub") { m.add("sub"); m.delete("sup"); }
  return m;
}

const isMsoIgnore = (el: HNode) => /mso-list\s*:\s*ignore/i.test(el.attrs.style ?? "");

function collectRuns(nodes: HNode[], marks: Set<Mark>, href: string | undefined, out: Run[]): void {
  for (const nd of nodes) {
    if (nd.tag === "#text") { out.push({ text: cleanText(nd.text ?? "").replace(/\s+/g, " "), marks, href }); continue; }
    if (nd.tag === "br") { out.push({ br: true, marks, href }); continue; }
    if (isMsoIgnore(nd)) continue;
    if (nd.tag === "img" || nd.tag === "hr") continue;
    let h = href;
    if (nd.tag === "a") {
      const safe = safeHref(nd.attrs.href ? cleanText(nd.attrs.href) : "");
      if (safe) h = safe;
    }
    collectRuns(nd.children, marksFor(nd, marks, !!h), h, out);
  }
}

function runsToHtml(runs: Run[]): string {
  // Collapse whitespace across run boundaries and trim the ends.
  const items: Run[] = [];
  let prevSpace = true;
  for (const r of runs) {
    if (r.br) { items.push(r); prevSpace = true; continue; }
    let t = r.text ?? "";
    if (prevSpace) t = t.replace(/^ /, "");
    if (!t) continue;
    prevSpace = t.endsWith(" ");
    items.push({ ...r, text: t });
  }
  while (items.length) {
    const last = items[items.length - 1];
    if (last.br) { items.pop(); continue; }
    last.text = (last.text ?? "").replace(/ $/, "");
    if (!last.text) { items.pop(); continue; }
    break;
  }
  while (items.length && items[0].br) items.shift();
  let html = "";
  for (const r of items) {
    if (r.br) { html += "<br>"; continue; }
    let s = esc(r.text ?? "");
    for (const m of ["sub", "sup", "s", "u", "em", "strong"] as Mark[]) if (r.marks.has(m)) s = `<${m}>${s}</${m}>`;
    if (r.href) s = `<a href="${esc(r.href)}">${s}</a>`;
    html += s;
  }
  return html;
}

// ---- block conversion -----------------------------------------------------------------------------------------------

interface Ctx { inCell: boolean; listDepth: number }

const hasBlockChild = (el: HNode): boolean => el.children.some((c) => c.tag !== "#text" && (BLOCK.has(c.tag) || hasBlockChild(c)));

const isMsoListPara = (el: HNode) => el.tag === "p" && (/mso-list\s*:\s*(?!none)/i.test(el.attrs.style ?? "") || /^MsoListParagraph/i.test(el.attrs.class ?? ""));

function msoInfo(el: HNode): { level: number; marker: string } {
  const lv = /level(\d+)/i.exec(el.attrs.style ?? "");
  let marker = "";
  const find = (nodes: HNode[]) => {
    for (const c of nodes) {
      if (marker) return;
      if (c.tag !== "#text" && isMsoIgnore(c)) { marker = collectText(c).trim(); return; }
      find(c.children);
    }
  };
  find(el.children);
  return { level: Math.min(Math.max(lv ? Number(lv[1]) : 1, 1), PASTE_LIMITS.maxListDepth), marker };
}
function collectText(el: HNode): string {
  return el.tag === "#text" ? cleanText(el.text ?? "") : el.children.map(collectText).join("");
}

type ListKind = { tag: "ul" } | { tag: "ol"; style: "decimal" | "alpha" | "roman"; start?: number };

function markerKind(marker: string): ListKind {
  const m = marker.replace(/[()\s.:]/g, "");
  if (/^\d+$/.test(m)) return { tag: "ol", style: "decimal", start: Number(m) > 1 ? Number(m) : undefined };
  if (/^[ivxlcdm]+$/i.test(m) && m.length > 1) return { tag: "ol", style: "roman" };
  if (/^[a-z]$/i.test(m)) return /^[ivxlcdm]$/i.test(m) && m.toLowerCase() === "i" ? { tag: "ol", style: "roman" } : { tag: "ol", style: "alpha" };
  return { tag: "ul" };
}

const listOpen = (k: ListKind) => (k.tag === "ul" ? "<ul>" : `<ol data-style="${k.style}"${k.start ? ` start="${k.start}"` : ""}>`);

/** Word's fake lists: consecutive MsoListParagraph paragraphs with a level, rebuilt as nested real lists. */
function renderMsoList(paras: HNode[]): string {
  const infos = paras.map((p) => ({ p, ...msoInfo(p) }));
  let html = "";
  const stack: { kind: ListKind; level: number }[] = [];
  const closeItem = () => { html += "</li>"; };
  let open = false;
  for (const it of infos) {
    const runs: Run[] = [];
    collectRuns(it.p.children, new Set(), undefined, runs);
    const text = runsToHtml(runs);
    const kind = markerKind(it.marker);
    while (stack.length && stack[stack.length - 1].level > it.level) { closeItem(); html += `</${stack.pop()!.kind.tag}>`; open = true; }
    const top = stack[stack.length - 1];
    if (!top || top.level < it.level) {
      if (open && top) { /* nested list inside the still-open item */ }
      stack.push({ kind, level: it.level });
      html += listOpen(kind);
    } else if (open) closeItem();
    html += `<li><p>${text}</p>`;
    open = true;
  }
  while (stack.length) { closeItem(); html += `</${stack.pop()!.kind.tag}>`; }
  return html;
}

function listStyleOf(el: HNode): "decimal" | "alpha" | "roman" {
  const t = (el.attrs.type ?? "").trim();
  const ls = styleOf(el)["list-style-type"] ?? "";
  if (t === "a" || t === "A" || /alpha/.test(ls)) return "alpha";
  if (t === "i" || t === "I" || /roman/.test(ls)) return "roman";
  return "decimal";
}

/** `<li>` HTML strings for a list; items deeper than the limit are lifted into the parent list so the nesting cap holds. */
function listItems(list: HNode, ctx: Ctx): string[] {
  const out: string[] = [];
  for (const li of list.children) {
    if (li.tag === "#text") continue;
    const items = li.tag === "li" ? [li] : [];
    if (!items.length) continue;
    const inline: HNode[] = [];
    const nested: HNode[] = [];
    for (const c of li.children) (c.tag === "ul" || c.tag === "ol" ? nested : inline).push(c);
    const parts: string[] = [];
    // Block children of the item (paragraphs, divs) become paragraphs; loose inline content becomes one paragraph.
    if (inline.some((c) => c.tag !== "#text" && BLOCK.has(c.tag))) parts.push(...blocks(inline, { ...ctx, inCell: true }, true));
    else {
      const runs: Run[] = [];
      collectRuns(inline, new Set(), undefined, runs);
      const t = runsToHtml(runs);
      parts.push(`<p>${t}</p>`);
    }
    const lifted: string[] = [];
    for (const nl of nested) {
      if (ctx.listDepth + 1 >= PASTE_LIMITS.maxListDepth) lifted.push(...listItems(nl, { ...ctx, listDepth: ctx.listDepth }));
      else parts.push(renderList(nl, { ...ctx, listDepth: ctx.listDepth + 1 }));
    }
    out.push(`<li>${parts.join("")}</li>`, ...lifted);
  }
  return out;
}

function renderList(list: HNode, ctx: Ctx): string {
  const items = listItems(list, ctx);
  if (!items.length) return "";
  if (list.tag === "ul") return `<ul>${items.join("")}</ul>`;
  const start = Number(list.attrs.start);
  return `<ol data-style="${listStyleOf(list)}"${Number.isInteger(start) && start > 1 && start < 10000 ? ` start="${start}"` : ""}>${items.join("")}</ol>`;
}

function cellContent(td: HNode): string {
  const html = blocks(td.children, { inCell: true, listDepth: 0 }, true).join("");
  return html || "<p></p>";
}

function renderTable(table: HNode): string {
  const rows: HNode[] = [];
  const gather = (n: HNode) => {
    for (const c of n.children) {
      if (c.tag === "tr") rows.push(c);
      else if (c.tag === "thead" || c.tag === "tbody" || c.tag === "tfoot") gather(c);
    }
  };
  gather(table);
  const grid: { header: boolean; html: string }[][] = [];
  for (const tr of rows.slice(0, PBDOC_LIMITS.maxTableRows)) {
    const cells: { header: boolean; html: string }[] = [];
    for (const td of tr.children) {
      if (td.tag !== "td" && td.tag !== "th") continue;
      const span = Math.min(Math.max(parseInt(td.attrs.colspan ?? "1", 10) || 1, 1), PBDOC_LIMITS.maxTableCols);
      cells.push({ header: td.tag === "th", html: cellContent(td) });
      for (let k = 1; k < span; k++) cells.push({ header: td.tag === "th", html: "<p></p>" });
    }
    if (cells.length) grid.push(cells.slice(0, PBDOC_LIMITS.maxTableCols));
  }
  if (!grid.length) return "";
  const cols = Math.max(...grid.map((r) => r.length));
  const header = grid[0].every((c) => c.header);
  const body = grid.map((r) => {
    const cells = [...r];
    while (cells.length < cols) cells.push({ header: false, html: "<p></p>" });
    return `<tr>${cells.map((c) => `<td>${c.html}</td>`).join("")}</tr>`;
  });
  return `<table data-header-row="${header ? "true" : "false"}">${body.join("")}</table>`;
}

/** Flattens a table found inside a cell (nested tables are not allowed) into one paragraph per row. */
function flattenTable(table: HNode): string[] {
  const out: string[] = [];
  const walkRows = (n: HNode) => {
    for (const c of n.children) {
      if (c.tag === "tr") {
        const runs: Run[] = [];
        for (const td of c.children) {
          if (td.tag === "td" || td.tag === "th") {
            if (runs.length) runs.push({ text: " ", marks: new Set() });
            collectRuns(td.children, new Set(), undefined, runs);
          }
        }
        const h = runsToHtml(runs);
        if (h) out.push(`<p>${h}</p>`);
      } else if (c.tag === "thead" || c.tag === "tbody" || c.tag === "tfoot") walkRows(c);
    }
  };
  walkRows(table);
  return out;
}

function blocks(nodes: HNode[], ctx: Ctx, cellLike = false): string[] {
  const out: string[] = [];
  let pending: HNode[] = [];
  const flush = () => {
    if (!pending.length) return;
    const runs: Run[] = [];
    collectRuns(pending, new Set(), undefined, runs);
    pending = [];
    const h = runsToHtml(runs);
    if (h) out.push(`<p>${h}</p>`);
  };
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    if (nd.tag === "#text" || !BLOCK.has(nd.tag)) { if (!(nd.tag === "img" || nd.tag === "hr")) pending.push(nd); continue; }
    flush();
    if (isMsoListPara(nd)) {
      const group: HNode[] = [nd];
      while (i + 1 < nodes.length && (isMsoListPara(nodes[i + 1]) || (nodes[i + 1].tag === "#text" && !(nodes[i + 1].text ?? "").trim()))) {
        i++;
        if (nodes[i].tag !== "#text") group.push(nodes[i]);
      }
      out.push(renderMsoList(group));
      continue;
    }
    switch (nd.tag) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
        const runs: Run[] = [];
        collectRuns(nd.children, new Set(), undefined, runs);
        const h = runsToHtml(runs);
        if (!h) break;
        if (ctx.inCell || cellLike) out.push(`<p>${h}</p>`);
        else out.push(`<h${Math.min(Number(nd.tag[1]), 4)}>${h}</h${Math.min(Number(nd.tag[1]), 4)}>`);
        break;
      }
      case "ul": case "ol": { const l = renderList(nd, { ...ctx, listDepth: 0 }); if (l) out.push(l); break; }
      case "table": {
        if (ctx.inCell || cellLike) out.push(...flattenTable(nd));
        else { const t = renderTable(nd); if (t) out.push(t); }
        break;
      }
      case "hr": break;
      case "tr": case "td": case "th": case "thead": case "tbody": case "tfoot": case "caption": case "li": case "dt": case "dd":
        out.push(...blocks(nd.children, ctx, cellLike));
        break;
      default:
        if (hasBlockChild(nd)) out.push(...blocks(nd.children, ctx, cellLike));
        else {
          const runs: Run[] = [];
          collectRuns(nd.children, new Set(), undefined, runs);
          const h = runsToHtml(runs);
          if (h) out.push(`<p>${h}</p>`);
        }
    }
  }
  flush();
  return out;
}

export interface PasteResult { html: string; truncated: boolean }

/** Cleans pasted HTML. Never throws; an oversize or empty input returns an empty string. */
export function cleanPastedHtml(input: string): PasteResult {
  if (typeof input !== "string" || !input) return { html: "", truncated: false };
  const truncated = input.length > PASTE_LIMITS.maxChars;
  const src = truncated ? input.slice(0, PASTE_LIMITS.maxChars) : input;
  // Only the body matters (Word and Google wrap the fragment in html/body and add comments around it).
  const fragment = /<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i.exec(src)?.[1] ?? src;
  const tree = parseHtml(fragment);
  const html = blocks(tree.children, { inCell: false, listDepth: 0 }).join("");
  return { html, truncated };
}

/** Whether the clipboard HTML came from this editor (ProseMirror marks its own slices). Those still go through the schema parser. */
export const isInternalPaste = (html: string) => /data-pm-slice=/.test(html);
