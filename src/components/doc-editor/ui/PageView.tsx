"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { mmToPx, pageDimensionsMm, type PageSettings } from "@/lib/products/playbook-ai/doc/page";
import type { ZoneBlock } from "@/lib/products/playbook-ai/doc/types";
import { computePageStarts, type Box } from "@/components/doc-editor/core/pagination";
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
  onPages?: (pages: number) => void;
  children: ReactNode;
}

/**
 * The A4 page view. Content flows in one continuous column inside paper-sized margins; page boundaries and "Page n of N" are estimated from
 * measured block heights and explicit page breaks. They approximate the PDF (which breaks lines and rows itself); the PDF preview is exact.
 */
export default function PageView({ editor, page, header, footer, brand, zone, values, resolved, resolveImageUrl, fit = true, onPages, children }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [starts, setStarts] = useState<number[]>([0]);
  const [scale, setScale] = useState(1);
  const [paperH, setPaperH] = useState(0);

  const dim = pageDimensionsMm(page);
  const W = mmToPx(dim.widthMm);
  const mt = mmToPx(page.margins.top), mb = mmToPx(page.margins.bottom), ml = mmToPx(page.margins.left), mr = mmToPx(page.margins.right);
  const H = mmToPx(dim.heightMm) - mt - mb;

  const measure = useCallback(() => {
    const dom = editor?.view?.dom as HTMLElement | undefined;
    if (!dom || !content.current) return;
    const base = dom.getBoundingClientRect().top;
    const k = scale || 1;
    const boxes: Box[] = [];
    for (const el of Array.from(dom.children) as HTMLElement[]) {
      const r = el.getBoundingClientRect();
      boxes.push({ top: (r.top - base) / k, height: r.height / k, pageBreak: el.getAttribute("data-type") === "pageBreak" });
    }
    const next = computePageStarts(boxes, H);
    setStarts((prev) => (prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 1) ? prev : next));
  }, [editor, H, scale]);

  useEffect(() => {
    if (!editor) return;
    let raf = 0;
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    editor.on("update", run);
    run();
    const ro = new ResizeObserver(run);
    const dom = editor.view?.dom;
    if (dom) ro.observe(dom);
    return () => { editor.off("update", run); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [editor, measure]);

  useEffect(() => { onPages?.(starts.length); }, [starts.length, onPages]);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fitScale = () => setScale(fit ? Math.min(1, Math.max(0.3, (el.clientWidth - 16) / W)) : 1);
    fitScale();
    const ro = new ResizeObserver(fitScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, fit]);

  useLayoutEffect(() => {
    const el = paper.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPaperH(el.offsetHeight));
    ro.observe(el);
    setPaperH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const pages = starts.length;
  const style = {
    width: W, paddingTop: mt, paddingBottom: mb, paddingLeft: ml, paddingRight: mr,
    transform: `scale(${scale})`, transformOrigin: "top left",
    ["--pb-primary" as string]: brand?.primaryColor ?? undefined, ["--pb-accent" as string]: brand?.accentColor ?? undefined, ["--pb-font" as string]: brand?.fontFamily ?? undefined,
  } as React.CSSProperties;
  const zoneProps = { zone, values, resolved, totalPages: pages, resolveImageUrl };

  return (
    <div ref={outer} className="w-full overflow-x-auto overflow-y-visible px-2 py-4">
      <div style={{ width: W * scale, height: paperH * scale, margin: "0 auto" }}>
        <div ref={paper} className="pb-paper" style={style} data-pages={pages}>
          {header.length > 0 && page.headerHeightMm > 0 && (
            <div className="absolute flex flex-col justify-end" style={{ top: 0, left: ml, right: mr, height: mt, paddingBottom: Math.max(mt - mmToPx(page.headerHeightMm), 0) / 2 }} aria-label="Header preview, read-only" title="Header (change it in the letterhead settings)">
              <ZonePreview blocks={header} pageNumber={1} {...zoneProps} />
            </div>
          )}
          <div ref={content} className="relative" style={{ minHeight: pages * H }}>
            {children}
            {starts.slice(1).map((y, i) => (
              <div key={y} className="pb-boundary" style={{ top: y, left: -ml, right: -mr }} aria-hidden>
                <span>Page {i + 1} ends · Page {i + 2} of {pages}</span>
              </div>
            ))}
          </div>
          {footer.length > 0 && page.footerHeightMm > 0 && (
            <div className="absolute" style={{ bottom: 0, left: ml, right: mr, height: mb, paddingTop: Math.max(mb - mmToPx(page.footerHeightMm), 0) / 2 }} aria-label="Footer preview, read-only" title="Footer (change it in the letterhead settings)">
              <ZonePreview blocks={footer} pageNumber={pages} {...zoneProps} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
