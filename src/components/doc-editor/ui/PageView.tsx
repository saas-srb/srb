"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { viewKey, type ViewBreak } from "@/components/doc-editor/schema/extensions";
import { mmToPx, pageDimensionsMm, type PageSettings } from "@/lib/products/playbook-ai/doc/page";
import type { ZoneBlock } from "@/lib/products/playbook-ai/doc/types";
import type { LayoutInput } from "@/lib/products/playbook-ai/doc/layout";
import { planBreaks, type FlowBlock } from "@/components/doc-editor/core/pagination";
import { buildOutline, tocEntries } from "@/components/doc-editor/core/outline";
import { matterFor, type TocLine } from "@/components/doc-editor/ui/front-matter";
import ZonePreview from "@/components/doc-editor/ui/ZonePreview";
import type { BrandTokens, ZoneValues } from "@/components/doc-editor/ui/types";

interface Props {
  editor: Editor | null;
  page: PageSettings;
  header: ZoneBlock[];
  footer: ZoneBlock[];
  brand?: BrandTokens;
  zone: ZoneValues;
  values: Record<string, string>;
  resolved: boolean;
  resolveImageUrl?: (fileId: string) => string | null;
  /** Fit the page to the available width (phones and narrow panes). */
  fit?: boolean;
  /** Fixed zoom in percent (75, 100, 125). 0 or absent: fit to the width. */
  zoom?: number;
  onPages?: (pages: number) => void;
  /** The sheet the cursor is on (1-based). */
  onCurrentPage?: (page: number) => void;
  /** What the export wraps around the content (title block, control table, contents, approval); drawn read-only on the sheets. */
  layout?: LayoutInput | null;
  /** Where the header and footer are edited; clicking them opens it. */
  brandHref?: string;
  /** Show the section, lock and condition labels in the margin. */
  structure?: boolean;
  /** The brand logo as a data URL, for the company details block. */
  logoUrl?: string;
  children: ReactNode;
}

const GAP = 28;
const CONTAINERS = new Set(["section", "conditional", "repeat", "bulletList", "orderedList", "listItem"]);
const SPLITTABLE = new Set(["paragraph", "clause"]);

interface Spacer { el: HTMLElement; top: number; h: number }

/** The text position at the start of line `line` (0-based) of a paragraph, found by probing character boxes; null when it cannot be told. */
function posAtLine(view: EditorView, el: HTMLElement, line: number, lineH: number, spacers: Spacer[]): number | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest(".pb-pagespacer") ? NodeFilter.FILTER_REJECT : n.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const nodes: { n: Text; start: number }[] = [];
  let total = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { nodes.push({ n: n as Text, start: total }); total += (n.nodeValue ?? "").length; }
  if (!total) return null;
  const inner = spacers.filter((sp) => el.contains(sp.el));
  const range = document.createRange();
  const loc = (i: number): { n: Text; off: number } => { let j = nodes.length - 1; while (j > 0 && nodes[j].start > i) j--; return { n: nodes[j].n, off: i - nodes[j].start }; };
  const g = (i: number): number => {
    const { n, off } = loc(i);
    range.setStart(n, off); range.setEnd(n, Math.min(off + 1, (n.nodeValue ?? "").length));
    const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
    const top = r.top;
    return top - inner.reduce((sum, sp) => (sp.el.getBoundingClientRect().top <= top + 0.5 ? sum + sp.el.getBoundingClientRect().height : sum), 0);
  };
  const g0 = g(0);
  const target = g0 + line * lineH * (el.getBoundingClientRect().height / Math.max(el.offsetHeight, 1) || 1) - lineH * 0.35;
  let lo = 0, hi = total - 1;
  if (g(hi) < target) return null;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (g(mid) >= target) hi = mid; else lo = mid + 1; }
  const { n, off } = loc(lo);
  try { return view.posAtDOM(n, off); } catch { return null; }
}

/**
 * The A4 sheet view, a WYSIWYG of the PDF: separate white sheets with a gap, the page margins, the brand's running header and footer ("Page n of N")
 * on every sheet, and the title block, control table, contents and approval blocks the export adds. The text is one editable column; spacers (view-only
 * widgets, never saved) push blocks to the next sheet so nothing crosses a sheet edge: whole blocks move, long paragraphs split between lines (two
 * lines minimum on each side), table rows move whole and the header row repeats, headings stay with the next block. Heights are measured from the
 * live layout and the plan is recomputed after every edit, resize, zoom, font and image load.
 */
export default function PageView({ editor, page, header, footer, brand, zone, values, resolved, resolveImageUrl, fit = true, zoom = 0, onPages, onCurrentPage, layout, brandHref, structure, logoUrl, children }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);
  const [scale, setScale] = useState(1);
  const [colH, setColH] = useState(0);
  const column = useRef<HTMLDivElement>(null);
  const settle = useRef(0);
  const tocPages = useRef<Map<number, number>>(new Map());
  const backPages = useRef<Record<string, number>>({});

  const dim = pageDimensionsMm(page);
  const W = mmToPx(dim.widthMm), PH = mmToPx(dim.heightMm);
  const mt = mmToPx(page.margins.top), mb = mmToPx(page.margins.bottom), ml = mmToPx(page.margins.left), mr = mmToPx(page.margins.right);
  const H = PH - mt - mb;
  // The export's zone geometry: the header starts headerTopMm from the top edge and the footer ends footerBottomMm above the bottom edge.
  const headerTop = mmToPx(Math.max(page.margins.top - page.headerHeightMm - 3, 5));
  const footerBottom = mmToPx(Math.max(page.margins.bottom - page.footerHeightMm - 3, 5));
  const wrapped = useMemo(() => { if (!layout) return false; const m = matterFor(layout, []); return m.front.length + m.back.length > 0; }, [layout]);

  const measure = useCallback(() => {
    const view = editor?.view;
    const dom = view?.dom as HTMLElement | undefined;
    if (!editor || !view || !dom || !dom.isConnected) return;
    const k = scale || 1;
    const base = dom.getBoundingClientRect().top;
    const size = view.state.doc.content.size;

    const spacers: Spacer[] = (Array.from(dom.querySelectorAll(".pb-pagespacer")) as HTMLElement[]).map((el) => { const r = el.getBoundingClientRect(); return { el, top: (r.top - base) / k, h: r.height / k }; });
    const natural = (top: number) => top - spacers.reduce((n, sp) => (sp.top < top - 0.5 ? n + sp.h : n), 0);
    const innerH = (el: HTMLElement) => spacers.reduce((n, sp) => (el.contains(sp.el) ? n + sp.h : n), 0);

    // Heading text to build the contents list with page numbers from the last plan.
    const toc: TocLine[] = tocEntries(buildOutline(view.state.doc), 2).map((h) => ({ id: String(h.id), level: h.level, text: h.text, page: tocPages.current.get(h.pos) ?? null }));
    const matter = matterFor(layout, toc, logoUrl, backPages.current);

    const blocks: FlowBlock[] = [];
    const meta: { kind: "block" | "heading"; key?: string; pos: number; el?: HTMLElement; lines?: number; lineH?: number }[] = [];
    const add = (b: FlowBlock, m: { kind: "block" | "heading"; key?: string; pos: number; el?: HTMLElement; lines?: number; lineH?: number }) => { blocks.push(b); meta.push(m); };

    matter.front.forEach((p, j) => {
      if (p.pageBreak) { add({ pos: 0, top: 0, height: 0, pageBreak: true }, { kind: "block", pos: 0 }); return; }
      const el = dom.querySelector(`:scope > .pb-matter[data-matter="${CSS.escape(p.key)}"]`) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      add({ pos: 0, top: natural((r.top - base) / k), height: r.height / k, side: -100 + 2 * j }, { kind: "block", pos: 0 });
    });

    const visit = (parent: PMNode, start: number) => {
      parent.forEach((node, off, index) => {
        const pos = start + off;
        const el = view.nodeDOM(pos) as HTMLElement | null;
        if (!el || el.nodeType !== 1) return;
        const name = node.type.name;
        if (name === "pageBreak") { add({ pos, top: 0, height: 0, pageBreak: true }, { kind: "block", pos }); return; }
        const r = el.getBoundingClientRect();
        if (r.height <= 0 || el.classList.contains("pb-cond-off")) return;
        if (CONTAINERS.has(name) && node.childCount > 0) { visit(node, pos + 1); return; }
        if (name === "table") {
          const headerRow = node.attrs.headerRow !== false;
          const first = view.nodeDOM(pos + 1) as HTMLElement | null;
          const headerH = headerRow && first ? first.getBoundingClientRect().height / k : 0;
          node.forEach((row, roff, ri) => {
            const rp = pos + 1 + roff;
            const rel = view.nodeDOM(rp) as HTMLElement | null;
            if (!rel || rel.nodeType !== 1) return;
            const rr = rel.getBoundingClientRect();
            add({ pos: rp, top: natural((rr.top - base) / k), height: rr.height / k - innerH(rel), keepNext: headerRow && ri === 0 && node.childCount > 1, repeat: headerRow && ri > 0 && headerH > 0 ? { pos: pos + 1, height: headerH } : undefined }, { kind: "block", pos: rp });
          });
          return;
        }
        const h = r.height / k - innerH(el);
        const flow: FlowBlock = { pos, top: natural((r.top - base) / k), height: h, keepNext: name === "heading" };
        const m: { kind: "block" | "heading"; key?: string; pos: number; el?: HTMLElement; lines?: number; lineH?: number } = { kind: name === "heading" ? "heading" : "block", pos };
        if (SPLITTABLE.has(name)) {
          const lineH = parseFloat(getComputedStyle(el).lineHeight);
          if (Number.isFinite(lineH) && lineH > 0) { const lines = Math.round(h / lineH); if (lines >= 4) { flow.lines = lines; flow.lineH = lineH; m.el = el; m.lines = lines; m.lineH = lineH; } }
        }
        add(flow, m);
        void index;
      });
    };
    visit(view.state.doc, 0);

    matter.back.forEach((p, j) => {
      const el = dom.querySelector(`:scope > .pb-matter[data-matter="${CSS.escape(p.key)}"]`) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      add({ pos: size, top: natural((r.top - base) / k), height: r.height / k, side: 50 + 2 * j, keepNext: p.key.endsWith("-heading") }, { kind: "block", pos: size, key: p.key.endsWith("-heading") ? p.key : undefined });
    });

    const plan = planBreaks(blocks, H, mb + GAP + mt);
    const resolved: ViewBreak[] = [];
    for (const br of plan.breaks) {
      if (br.line !== undefined) {
        const bi = blocks.findIndex((b, i) => b.pos === br.pos && meta[i].el);
        const m = bi >= 0 ? meta[bi] : null;
        const p = m?.el && m.lineH ? posAtLine(view, m.el, br.line, m.lineH, spacers) : null;
        if (p !== null && p !== undefined) resolved.push({ pos: p, height: br.height, inline: true });
      } else resolved.push({ pos: br.pos, height: br.height, repeatPos: br.repeat?.pos, side: br.side === undefined ? undefined : br.side - 1 });
    }

    // Page numbers for the contents list, taken from where each heading starts.
    const nextToc = new Map<number, number>();
    const nextBack: Record<string, number> = {};
    meta.forEach((m, i) => { if (m.kind === "heading") nextToc.set(m.pos, plan.pageOf[i]); else if (m.key) nextBack[m.key] = plan.pageOf[i]; });
    const backChanged = JSON.stringify(nextBack) !== JSON.stringify(backPages.current);
    backPages.current = nextBack;
    const tocChanged = backChanged || nextToc.size !== tocPages.current.size || [...nextToc].some(([p, n]) => tocPages.current.get(p) !== n);
    tocPages.current = nextToc;

    const st = viewKey.getState(view.state);
    const cur = st?.breaks ?? [];
    const same = cur.length === resolved.length && cur.every((b, i) => b.pos === resolved[i].pos && Math.abs(b.height - resolved[i].height) < 1 && !!b.inline === !!resolved[i].inline && b.repeatPos === resolved[i].repeatPos);
    const finalToc: TocLine[] = tocChanged ? tocEntries(buildOutline(view.state.doc), 2).map((h) => ({ id: String(h.id), level: h.level, text: h.text, page: nextToc.get(h.pos) ?? null })) : toc;
    const m2 = tocChanged ? matterFor(layout, finalToc, logoUrl, backPages.current) : matter;
    const frontNow = st?.front.map((x) => x.key + x.html).join("|");
    const frontNext = m2.front.filter((x) => !x.pageBreak).map((x) => x.key + x.html).join("|");
    const backNow = st?.back.map((x) => x.key + x.html).join("|");
    const backNext = m2.back.map((x) => x.key + x.html).join("|");
    const hideToc = !!layout && wrapped && layout.kind === "sop";
    const needMatter = frontNow !== frontNext || backNow !== backNext || st?.hideToc !== hideToc || (tocChanged && layout?.kind === "sop");
    if ((!same || needMatter) && settle.current < 8) {
      settle.current += 1;
      const meta2: Record<string, unknown> = {};
      if (!same) meta2.breaks = resolved;
      if (needMatter) { meta2.front = m2.front.filter((x) => !x.pageBreak); meta2.back = m2.back; meta2.hideToc = hideToc; }
      view.dispatch(view.state.tr.setMeta(viewKey, meta2).setMeta("addToHistory", false));
    } else if (same && !needMatter) settle.current = 0;
    setPages((p) => (p === plan.pages ? p : plan.pages));
  }, [editor, H, mb, mt, scale, layout, wrapped, logoUrl]);

  useEffect(() => {
    if (!editor) return;
    let raf = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    // Typing is throttled so a long document does not re-measure on every key; layout changes (resize, fonts, images) measure at once.
    const onUpdate = () => { settle.current = 0; if (timer) clearTimeout(timer); timer = setTimeout(run, 90); };
    editor.on("update", onUpdate);
    run();
    const ro = new ResizeObserver(run);
    const dom = editor.view?.dom;
    if (dom) ro.observe(dom);
    const imgs = () => run();
    dom?.addEventListener("load", imgs, true);
    if (typeof document !== "undefined" && document.fonts?.ready) void document.fonts.ready.then(run);
    return () => { editor.off("update", onUpdate); ro.disconnect(); dom?.removeEventListener("load", imgs, true); cancelAnimationFrame(raf); if (timer) clearTimeout(timer); };
  }, [editor, measure]);

  useEffect(() => { onPages?.(pages); }, [pages, onPages]);

  // The sheet the cursor is on.
  useEffect(() => {
    if (!editor || !onCurrentPage) return;
    const upd = () => {
      try {
        const dom = editor.view.dom as HTMLElement;
        const c = editor.view.coordsAtPos(editor.state.selection.head);
        const y = mt + (c.top - dom.getBoundingClientRect().top) / (scale || 1);
        onCurrentPage(Math.min(Math.max(Math.floor(y / (PH + GAP)) + 1, 1), pages));
      } catch { /* the view is not ready */ }
    };
    editor.on("selectionUpdate", upd);
    editor.on("update", upd);
    upd();
    return () => { editor.off("selectionUpdate", upd); editor.off("update", upd); };
  }, [editor, onCurrentPage, mt, PH, scale, pages]);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fitScale = () => setScale(zoom > 0 ? zoom / 100 : fit ? Math.min(1, Math.max(0.3, (el.clientWidth - 96) / W)) : 1);
    fitScale();
    const ro = new ResizeObserver(fitScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, fit, zoom]);

  useLayoutEffect(() => {
    const el = column.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setColH(el.offsetHeight));
    ro.observe(el);
    setColH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const total = Math.max(pages * PH + (pages - 1) * GAP, mt + colH + mb);
  const style = {
    width: W, height: total, transform: `scale(${scale})`, transformOrigin: "top left",
    ["--pb-ml" as string]: `${ml}px`,
    ["--pb-primary" as string]: brand?.primaryColor ?? undefined, ["--pb-accent" as string]: brand?.accentColor ?? undefined, ["--pb-font" as string]: brand?.fontFamily ?? undefined,
  } as React.CSSProperties;
  const zoneFull: ZoneValues = { ...zone, version: zone.version ?? (layout?.version ?? undefined), date: zone.date ?? layout?.dateText, title: zone.title ?? layout?.title, docNumber: zone.docNumber ?? layout?.docNumber ?? undefined };
  const zoneProps = { zone: zoneFull, values, resolved, totalPages: pages, resolveImageUrl };
  const zoneWrap = (inner: ReactNode, label: string) => (brandHref ? <a href={brandHref} className="pb-zone-link" title={`${label}: click to change it in Brand & Letterhead`} aria-label={`${label}, opens Brand & Letterhead`}>{inner}</a> : <>{inner}</>);

  return (
    <div ref={outer} className="pb-sheets-outer w-full overflow-x-auto overflow-y-visible px-[48px] py-6">
      <div style={{ width: W * scale, height: total * scale, margin: "0 auto" }}>
        <div className={`pb-paper pb-sheets${resolved ? " pb-clean" : ""}${structure ? " pb-structure" : ""}`} style={style} data-pages={pages}>
          {Array.from({ length: pages }, (_, i) => (
            <div key={i} className="pb-sheet" style={{ top: i * (PH + GAP), width: W, height: PH }} role="img" aria-label={`Page ${i + 1} of ${pages}`}>
              {header.length > 0 && page.headerHeightMm > 0 && (
                <div className="absolute" style={{ top: headerTop, left: ml, right: mr, minHeight: mmToPx(page.headerHeightMm) }}>
                  {zoneWrap(<ZonePreview blocks={header} pageNumber={i + 1} {...zoneProps} />, "Header")}
                </div>
              )}
              {footer.length > 0 && page.footerHeightMm > 0 && (
                <div className="absolute flex flex-col justify-end" style={{ bottom: footerBottom, left: ml, right: mr, minHeight: mmToPx(page.footerHeightMm) }}>
                  {zoneWrap(<ZonePreview blocks={footer} pageNumber={i + 1} {...zoneProps} />, "Footer")}
                </div>
              )}
            </div>
          ))}
          <div ref={column} style={{ position: "relative", zIndex: 1, paddingTop: mt, paddingLeft: ml, paddingRight: mr, paddingBottom: mb, minHeight: PH, pointerEvents: "none" }}>
            <div style={{ pointerEvents: "auto" }}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
