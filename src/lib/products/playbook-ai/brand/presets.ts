/**
 * Ready-made letterhead styles. Pure, client-safe. A preset sets the look (colours, fonts, logo position, which pages carry the letterhead, the
 * header and footer lines and the page-number style); it never touches the company's own logo, signatories or watermark words. Every line reads
 * a company value, so a line whose value the company has not saved is left out cleanly (no empty labels). Choosing a preset is only a starting
 * point: every setting can still be edited.
 */
import { DEFAULT_BRAND, type BrandLine, type BrandSettings } from "@/lib/products/playbook-ai/brand/types";

export interface BrandPreset {
  id: string;
  label: string;
  description: string;
  patch: Pick<BrandSettings, "colors" | "fontPair" | "letterhead" | "headerLines" | "footerLines"> & { logoPosition: "left" | "center" | "right"; footer: BrandSettings["footer"] };
}

const L = (key: string, text = "", bold = false): BrandLine => ({ key, text, bold });
const footer = (align: "left" | "center" | "right", confidential = false, pageFormat: BrandSettings["footer"]["pageFormat"] = "x_of_y"): BrandSettings["footer"] => ({ showDocNumber: true, showPageNumbers: true, align, pageFormat, confidential });

export const BRAND_PRESETS: readonly BrandPreset[] = [
  { id: "classic", label: "Classic", description: "Logo on the left, legal name, address and registrations on top, e-mail in the footer.",
    patch: { colors: { primary: "#1E3A5F", secondary: "#B45309" }, fontPair: "sans", letterhead: "all", logoPosition: "left", headerLines: DEFAULT_BRAND.headerLines, footerLines: [], footer: footer("center") } },
  { id: "formal", label: "Formal", description: "Centred logo and name, serif type, letterhead on the first page, registrations in the footer.",
    patch: { colors: { primary: "#1F2937", secondary: "#7C2D12" }, fontPair: "serif", letterhead: "first", logoPosition: "center", headerLines: [L("company.legal_name", "", true), L("company.address")], footerLines: [], footer: footer("center") } },
  { id: "modern", label: "Modern", description: "Clean sans type with a teal accent, contact details in the header and the address in the footer.",
    patch: { colors: { primary: "#0F766E", secondary: "#0369A1" }, fontPair: "sans", letterhead: "all", logoPosition: "left", headerLines: [L("company.name", "", true), L("company.website"), L("company.email")], footerLines: [], footer: footer("left") } },
  { id: "legal", label: "Legal", description: "Serif throughout, centred letterhead on every page, registrations and a confidential line in the footer.",
    patch: { colors: { primary: "#111827", secondary: "#6B7280" }, fontPair: "serif", letterhead: "all", logoPosition: "center", headerLines: [L("company.legal_name", "", true), L("company.address")], footerLines: [], footer: footer("center", true) } },
  { id: "minimal", label: "Minimal", description: "Just the name on the first page, a quiet footer with e-mail and phone, page number only.",
    patch: { colors: { primary: "#374151", secondary: "#2563EB" }, fontPair: "sans", letterhead: "first", logoPosition: "left", headerLines: [L("company.name", "", true)], footerLines: [], footer: footer("right", false, "x") } },
  { id: "corporate", label: "Corporate", description: "Serif headings with sans text, logo on the right, full registration details in the footer.",
    patch: { colors: { primary: "#14532D", secondary: "#A16207" }, fontPair: "classic", letterhead: "all", logoPosition: "right", headerLines: [L("company.legal_name", "", true), L("company.address")], footerLines: [], footer: footer("center", false, "x_slash_y") } },
];

export const presetById = (id: string): BrandPreset | undefined => BRAND_PRESETS.find((p) => p.id === id);

/** The brand with a preset's look applied; the company's logo file, signatories, margins and watermark words stay. */
export function applyPreset(b: BrandSettings, id: string): BrandSettings {
  const p = presetById(id);
  if (!p) return b;
  return { ...b, preset: p.id, colors: p.patch.colors, fontPair: p.patch.fontPair, letterhead: p.patch.letterhead, headerLines: p.patch.headerLines.map((l) => ({ ...l })), footerLines: p.patch.footerLines.map((l) => ({ ...l })), footer: { ...p.patch.footer }, logo: { ...b.logo, position: p.patch.logoPosition } };
}

/** Statutory ids the footer can carry, with the label printed in front of the value. */
export const STATUTORY_IDS: readonly { key: string; label: string }[] = [
  { key: "company.cin", label: "CIN" }, { key: "company.gstin", label: "GSTIN" }, { key: "company.pan", label: "PAN" }, { key: "company.tan", label: "TAN" },
];
