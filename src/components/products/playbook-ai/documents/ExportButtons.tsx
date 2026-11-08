import { Button } from "@/components/ui/button";

/**
 * "Download PDF" and "Download Word" for a document. Plain links: the browser downloads the file from
 * `/api/playbook-ai/documents/[id]/export`, which checks permission, watermarks anything that is not issued and serves the sealed copy of an
 * issued version. Pass `canExport` from `documentCapabilities(...).export`; the route re-checks it either way.
 */
export function exportUrl(documentId: string, format: "pdf" | "docx", version?: number | "draft"): string {
  const q = new URLSearchParams({ format });
  if (version !== undefined) q.set("version", String(version));
  return `/api/playbook-ai/documents/${encodeURIComponent(documentId)}/export?${q.toString()}`;
}

export default function ExportButtons({ documentId, version, canExport = true }: { documentId: string; version?: number | "draft"; canExport?: boolean }) {
  if (!canExport) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" nativeButton={false} render={<a href={exportUrl(documentId, "pdf", version)} download />}>
        Download PDF
      </Button>
      <Button variant="outline" size="sm" nativeButton={false} render={<a href={exportUrl(documentId, "docx", version)} download />}>
        Download Word
      </Button>
    </div>
  );
}
