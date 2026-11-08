"use client";

import type { InlineNode, ZoneBlock } from "@/lib/products/playbook-ai/doc/types";
import type { ZoneValues } from "@/components/doc-editor/ui/types";

interface Props {
  blocks: ZoneBlock[];
  zone: ZoneValues;
  pageNumber: number;
  totalPages: number;
  values: Record<string, string>;
  resolved: boolean;
  resolveImageUrl?: (fileId: string) => string | null;
}

const FIELD_LABEL: Record<string, string> = { docNumber: "Document number", version: "Version", date: "Date", title: "Title" };

function Inline({ nodes, ...p }: { nodes: InlineNode[] } & Omit<Props, "blocks">) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "text": {
            const m = new Set((n.marks ?? []).map((x) => x.type));
            return <span key={i} style={{ fontWeight: m.has("bold") ? 700 : undefined, fontStyle: m.has("italic") ? "italic" : undefined, textDecoration: [m.has("underline") ? "underline" : "", m.has("strike") ? "line-through" : ""].join(" ").trim() || undefined }}>{n.text}</span>;
          }
          case "var": {
            const v = p.values[n.key];
            const shown = p.resolved && v ? v : p.resolved && n.fallback ? n.fallback : `{{${n.key}}}`;
            return <span key={i}>{shown}</span>;
          }
          case "placeholder": return <span key={i}>[{n.label}]</span>;
          case "field": {
            if (n.field === "pageNumber") return <span key={i}>{p.pageNumber}</span>;
            if (n.field === "totalPages") return <span key={i}>{p.totalPages}</span>;
            const v = p.zone[n.field as keyof ZoneValues];
            return <span key={i}>{v ?? `‹${FIELD_LABEL[n.field] ?? n.field}›`}</span>;
          }
          case "hardBreak": return <br key={i} />;
        }
      })}
    </>
  );
}

/** Read-only rendering of a header or footer zone. The text matches the PDF closely enough to judge layout; the PDF preview is exact. */
export default function ZonePreview(props: Props) {
  const { blocks, resolveImageUrl } = props;
  return (
    <div className="pb-zone">
      {blocks.map((b) => {
        switch (b.type) {
          case "paragraph":
            return <p key={b.id} style={{ textAlign: b.align }}><Inline nodes={b.content} {...props} /></p>;
          case "divider":
            return <hr key={b.id} style={{ border: 0, borderTop: "1px solid var(--pb-primary)", margin: "2px 0" }} />;
          case "image": {
            const src = resolveImageUrl?.(b.fileId);
            // eslint-disable-next-line @next/next/no-img-element
            return src ? <img key={b.id} src={src} alt={b.alt} style={{ width: `${b.widthPct}%`, marginLeft: b.align === "center" ? "auto" : b.align === "right" ? "auto" : undefined, marginRight: b.align === "center" ? "auto" : undefined }} /> : <span key={b.id}>{b.alt}</span>;
          }
          case "table":
            return (
              <table key={b.id} style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {b.rows.map((r) => (
                    <tr key={r.id}>
                      {r.cells.map((c) => (
                        <td key={c.id} style={{ verticalAlign: "top", textAlign: c.align }}>
                          {c.content.map((x) => (x.type === "paragraph" ? <p key={x.id}><Inline nodes={x.content} {...props} /></p> : null))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
        }
      })}
    </div>
  );
}
