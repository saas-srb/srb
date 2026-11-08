import { PDF_TYPES, type PdfType } from "@/lib/pdf/catalog";

/** Which kind of PDF (if any) a request is for, from its path and query, so the platform's on/off switch can refuse it in one place. */

const TEMPLATES = PDF_TYPES.filter((t) => t.status === "active").map((t) => {
  const path = t.route.split("?")[0];
  const re = new RegExp(`^${path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]+\}/g, "[^/]+")}/?$`);
  return { type: t, re };
});

export function pdfTypeOfRequest(pathname: string, search: URLSearchParams): PdfType | null {
  // The library's own sample route is not a company document.
  if (pathname.startsWith("/api/pdf-library/") || pathname.startsWith("/api/platform/pdfs/")) return null;
  for (const { type, re } of TEMPLATES) {
    if (!re.test(pathname)) continue;
    // A report route also serves CSV and Excel: only the PDF format is this document.
    if (type.alsoAs?.length) {
      const format = (search.get("format") ?? (type.key === "pms_report" ? "pdf" : "")).toLowerCase();
      if (format !== "pdf") return null;
    }
    return type;
  }
  return null;
}
