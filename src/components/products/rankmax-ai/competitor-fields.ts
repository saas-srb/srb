import type { FieldDef } from "@/components/products/playbook-ai/EditDialog";
import type { Competitor } from "@/lib/products/rankmax-ai/competitors";

export const COMPETITOR_FIELDS: FieldDef[] = [
  { key: "name", label: "Name", type: "text", maxLength: 100 },
  { key: "domain", label: "Domain", type: "text", placeholder: "example.com" },
  { key: "organicKeywords", label: "Organic keywords (est.)", type: "number", min: 0 },
  { key: "rankingKeywords", label: "Top-10 keywords (est.)", type: "number", min: 0 },
  { key: "organicTraffic", label: "Organic traffic / month (est.)", type: "number", min: 0 },
  { key: "backlinks", label: "Backlinks (est.)", type: "number", min: 0 },
  { key: "referringDomains", label: "Referring domains (est.)", type: "number", min: 0 },
  { key: "domainRating", label: "Domain rating 0–100 (est.)", type: "number", min: 0, max: 100 },
  { key: "source", label: "Data source", type: "text", placeholder: "e.g. Ahrefs, Semrush" },
  { key: "asOf", label: "As of", type: "date" },
  { key: "color", label: "Chart color", type: "color" },
  { key: "topPages", label: "Top pages — one per line: url, traffic, keywords (est.)", type: "textarea", rows: 4 },
  { key: "notes", label: "Notes", type: "textarea", rows: 2 },
];

export function competitorInitial(c: Competitor | null): Record<string, string> {
  const n = (x: number | null | undefined) => (x === null || x === undefined ? "" : String(x));
  return {
    name: c?.name ?? "",
    domain: c?.domain ?? "",
    organicKeywords: n(c?.metrics.organicKeywords),
    rankingKeywords: n(c?.metrics.rankingKeywords),
    organicTraffic: n(c?.metrics.organicTraffic),
    backlinks: n(c?.metrics.backlinks),
    referringDomains: n(c?.metrics.referringDomains),
    domainRating: n(c?.metrics.domainRating),
    source: c?.metrics.source ?? "",
    asOf: c?.metrics.asOf ?? "",
    color: c?.color ?? "#f59e0b",
    topPages: c?.topPages.map((p) => [p.url, p.traffic ?? "", p.keywords ?? ""].join(", ")).join("\n") ?? "",
    notes: c?.notes ?? "",
  };
}
