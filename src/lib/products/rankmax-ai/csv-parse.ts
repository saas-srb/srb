import "server-only";
import { parseCsv as parseRawCsv } from "@/lib/campaign-csv";

/**
 * CSV reader for keyword / ranking / backlink imports — the platform's
 * existing RFC 4180 parser, with headers normalised (lower-case, spaces →
 * underscores) so "Target URL" and "target_url" both work.
 */
export function parseCsv(text: string, maxRows = 5000): { headers: string[]; rows: Record<string, string>[] } {
  const { headers, records } = parseRawCsv(text);
  const norm = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return {
    headers: headers.map(norm),
    rows: records.slice(0, maxRows).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [norm(k), v]))),
  };
}
