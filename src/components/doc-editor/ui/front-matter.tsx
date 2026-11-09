import { renderToStaticMarkup } from "react-dom/server";
import type { ContentBlock, InlineNode } from "@/lib/products/playbook-ai/doc/types";
import { groupSignatureRows, type SignatureRow } from "@/lib/products/playbook-ai/doc/signature-rows";
import { wrapBody, wantsLayout, type LayoutInput } from "@/lib/products/playbook-ai/doc/layout";

/** One read-only block of the generated front or back matter, already rendered to markup (view-only: never part of the saved document). */
export interface MatterPiece { key: string; html: string; pageBreak?: boolean }
export interface TocLine { id: string; level: number; text: string; page: number | null }

const BORDER = "#CBD5E1", HEAD_BG = "#EEF2F7", MUTED = "#6b7280";
const MARKER = "pb-matter-marker";

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return <>{nodes.map((n, i) => (n.type === "text" ? <span key={i} style={{ fontWeight: n.marks?.some((m) => m.type === "bold") ? 700 : undefined, color: n.marks?.some((m) => m.type === "color" && m.color === "muted") ? "#6B7280" : undefined }}>{n.text}</span> : n.type === "hardBreak" ? <br key={i} /> : null))}</>;
}

function Block({ b, toc, logoUrl }: { b: ContentBlock | SignatureRow<ContentBlock>; toc: TocLine[]; logoUrl?: string }) {
  switch (b.type) {
    case "paragraph": return <p style={{ margin: 0, textAlign: b.align ?? undefined }}><Inline nodes={b.content} /></p>;
    case "heading": {
      const g = { 1: [20, 0, true], 2: [15, 14, true], 3: [12.5, 10, false], 4: [11, 8, false] }[b.level] as [number, number, boolean];
      return <h2 style={{ margin: 0, fontSize: `${g[0]}pt`, fontWeight: 700, lineHeight: 1.25, color: g[2] ? "var(--pb-primary)" : undefined, paddingTop: `${g[1]}pt`, textAlign: b.align ?? undefined, marginBottom: "4pt" }}><Inline nodes={b.content} /></h2>;
    }
    case "letterhead": {
      const right = b.align === "right";
      const ta = right ? "right" : "left";
      const brand = (
        <div style={{ flex: 1, textAlign: ta }}>
          {b.logoFileId && logoUrl ? <div style={{ marginBottom: 4 }}>{/* eslint-disable-next-line @next/next/no-img-element -- a data URL of the brand logo */}<img src={logoUrl} alt="Company logo" style={{ width: `${b.logoWidthMm ?? 32}mm`, height: "auto", display: "inline-block" }} /></div> : null}
          {b.name ? <div style={{ fontSize: "14pt", fontWeight: 700, color: "var(--pb-primary)", marginBottom: 2 }}>{b.name}</div> : null}
          {b.address.map((l, i) => <div key={i} style={{ fontSize: "9pt", color: "#6B7280", lineHeight: 1.35 }}>{l}</div>)}
        </div>
      );
      const details = b.details.length ? (
        <div style={{ width: "62mm", textAlign: right ? "left" : "right", ...(right ? { paddingRight: 8 } : { paddingLeft: 8 }) }}>
          {b.details.map((d, i) => <div key={i} style={{ fontSize: "9pt", lineHeight: 1.45 }}><span style={{ color: "#6B7280", fontSize: "8pt" }}>{d.label}: </span>{d.value}</div>)}
        </div>
      ) : null;
      return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>{right ? <>{details}{brand}</> : <>{brand}{details}</>}</div>;
    }
    case "divider": return <div style={{ borderBottom: "0.75pt solid #CBD5E1", margin: "6pt 0" }} />;
    case "image": return logoUrl ? <div style={{ textAlign: b.align }}>{/* eslint-disable-next-line @next/next/no-img-element -- a data URL of the brand logo */}<img src={logoUrl} alt={b.alt} style={{ width: `${b.widthPct}%`, height: "auto" }} /></div> : null;
    case "spacer": return <div style={{ height: `${b.heightMm}mm` }} />;
    case "table":
      return (
        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
          <colgroup>{b.colWidths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={r.id}>
                {r.cells.map((c) => (
                  <td key={c.id} style={{ border: `0.75pt solid ${BORDER}`, padding: "4pt", verticalAlign: "top", textAlign: c.align ?? undefined, background: b.headerRow && ri === 0 ? HEAD_BG : undefined, fontWeight: b.headerRow && ri === 0 ? 700 : undefined }}>
                    {c.content.map((p) => (p.type === "paragraph" ? <p key={p.id} style={{ margin: 0, textAlign: p.align ?? undefined }}><Inline nodes={p.content} /></p> : null))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "toc":
      return (
        <div>
          <div style={{ fontSize: "15pt", fontWeight: 700, color: "var(--pb-primary)", marginBottom: 6 }}>Contents</div>
          {toc.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "flex-end", marginBottom: 3, paddingLeft: `${(e.level - 1) * 5}mm` }}>
              <span>{e.text}</span>
              <span style={{ flexGrow: 1, borderBottom: `0.75pt dotted ${MUTED}`, margin: "0 4px 3px" }} />
              <span>{e.page ?? ""}</span>
            </div>
          ))}
        </div>
      );
    case "signatureRow": return <div style={{ display: "flex" }}>{b.blocks.map((s) => <div key={s.id} style={{ width: "50%", paddingRight: 14 }}><Block b={s} toc={toc} logoUrl={logoUrl} /></div>)}</div>;
    case "signatureBlock": {
      const line = (label: string, h: string | number = 12) => (
        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 6 }}>
          <span style={{ width: "24mm", fontSize: "9pt", color: MUTED }}>{label}</span>
          <span style={{ flex: 1, borderBottom: "0.75pt solid #111827", height: h }} />
        </div>
      );
      return (
        <div style={{ width: "100%", marginTop: 4, marginBottom: 14 }}>
          <div style={{ fontWeight: 700 }}>{b.label}</div>
          {line("Signature", "14mm")}
          {b.showName ? line("Name") : null}{b.showDesignation ? line("Designation") : null}{b.showDate ? line("Date") : null}
        </div>
      );
    }
    default: return null;
  }
}

/**
 * The blocks the export adds around the content (title block, control table, contents, revision history, approval), built by the SAME function the
 * export uses (`wrapBody`), so the editor and the PDF cannot drift. Each block is its own piece so the sheet view can place a page break between them.
 */
export function matterFor(layout: LayoutInput | null | undefined, headings: TocLine[], logoUrl?: string, backPages: Record<string, number> = {}): { front: MatterPiece[]; back: MatterPiece[] } {
  if (!layout || (!wantsLayout(layout) && !layout.identity)) return { front: [], back: [] };
  const marker: ContentBlock = { id: MARKER, type: "paragraph", content: [] };
  const all = wrapBody([marker], layout);
  const at = all.findIndex((b) => b.id === MARKER);
  // Ids from the layout builder change on every call, so the pieces are keyed by position and kind (stable between calls).
  // The export lists the headings it adds itself (Revision history, Approval) in the contents too.
  const backHeads: TocLine[] = groupSignatureRows(all.slice(at + 1)).flatMap((b, i) => (b.type === "heading" && b.level <= 2 ? [{ id: `b${i}-heading`, level: b.level, text: b.content.map((n) => (n.type === "text" ? n.text : "")).join(""), page: backPages[`b${i}-heading`] ?? null }] : []));
  const allHeadings = [...headings, ...backHeads];
  const piece = (b: ContentBlock | SignatureRow<ContentBlock>, i: number, side: string): MatterPiece => ({
    key: `${side}${i}-${b.type}`,
    pageBreak: b.type === "pageBreak",
    html: b.type === "pageBreak" ? "" : renderToStaticMarkup(<Block b={b} toc={allHeadings} logoUrl={logoUrl} />),
  });
  return { front: all.slice(0, at).map((b, i) => piece(b, i, "f")), back: groupSignatureRows(all.slice(at + 1)).map((b, i) => piece(b, i, "b")) };
}
