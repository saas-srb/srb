/**
 * The company identity block printed once, at the top of page 1 of every document (PDF, DOCX, the editor and the previews). Pure and client-safe:
 * it only turns the company values and the brand's switches into the lines to print. A field the company has not filled in is left out together
 * with its label, so the block never shows an empty label or a placeholder.
 */
import type { VarValues } from "@/lib/products/playbook-ai/doc/variables";

export interface IdentitySettings {
  /** Show the company details block on the first page. */
  show: boolean;
  logo: boolean;
  address: boolean;
  gstin: boolean;
  cin: boolean;
  pan: boolean;
  website: boolean;
  /** Phone and email. */
  contact: boolean;
}

export const DEFAULT_IDENTITY: IdentitySettings = { show: true, logo: true, address: true, gstin: true, cin: true, pan: false, website: true, contact: true };

export const IDENTITY_TOGGLES: { key: Exclude<keyof IdentitySettings, "show">; label: string }[] = [
  { key: "logo", label: "Logo" }, { key: "address", label: "Registered address" }, { key: "gstin", label: "GSTIN" }, { key: "cin", label: "CIN" },
  { key: "pan", label: "PAN" }, { key: "website", label: "Website" }, { key: "contact", label: "Phone and email" },
];

/** What the layout prints: a brand side (logo, name, address lines) and a details side (one "Label: value" per line). */
export interface IdentityBlockInput {
  /** The side the brand side sits on (follows the brand's logo position; "center" prints on the left). */
  align: "left" | "right";
  name: string;
  address: string[];
  details: { label: string; value: string }[];
  logo: { widthMm: number } | null;
}

const val = (v: VarValues, k: string): string => { const x = v[k]; return x === undefined || x === null ? "" : String(x).trim(); };

/** Breaks an address into short lines (at commas, up to about 46 characters a line). */
export function addressLines(address: string, max = 46): string[] {
  const parts = address.split(/,\s*/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last !== undefined && last.length + 2 + p.length <= max) out[out.length - 1] = `${last}, ${p}`;
    else out.push(p);
  }
  return out.length ? out.map((l, i) => (i < out.length - 1 ? `${l},` : l)) : [];
}

export function identityBlockInput(
  values: VarValues,
  s: IdentitySettings,
  opts: { align: "left" | "center" | "right"; hasLogo: boolean; logoWidthMm: number },
): IdentityBlockInput | null {
  if (!s.show) return null;
  const name = val(values, "company.legal_name") || val(values, "company.name");
  const address = s.address && val(values, "company.address") ? addressLines(val(values, "company.address")) : [];
  const details: { label: string; value: string }[] = [];
  const add = (on: boolean, label: string, key: string) => { if (on && val(values, key)) details.push({ label, value: val(values, key) }); };
  add(s.gstin, "GSTIN", "company.gstin");
  add(s.cin, "CIN", "company.cin");
  add(s.pan, "PAN", "company.pan");
  add(s.contact, "Phone", "company.phone");
  add(s.contact, "Email", "company.email");
  add(s.website, "Website", "company.website");
  const logo = s.logo && opts.hasLogo ? { widthMm: Math.min(Math.max(opts.logoWidthMm, 10), 60) } : null;
  if (!name && !address.length && !details.length && !logo) return null;
  return { align: opts.align === "right" ? "right" : "left", name, address, details, logo };
}
