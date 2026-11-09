/**
 * Company brand and letterhead for Playbook documents. Pure, client-safe types, defaults and validation (no database, no Node APIs): the
 * Brand settings form uses the same `validateBrandInput` the server action re-runs before saving.
 *
 * What a brand controls: logo and where it sits, two colours, the font pair (only fonts bundled with the app, so every export looks the
 * same on every server), the lines printed in the header and footer (taken from the company profile, never typed twice), whether the
 * letterhead repeats on every page or only the first, default margins, the watermark words for drafts and unreviewed documents, and
 * the signatory signature and stamp images that later signing features use.
 */

import { DEFAULT_IDENTITY, type IdentitySettings } from "@/lib/products/playbook-ai/brand/identity";
import { DEFAULT_PAGE, MARGIN_LIMITS, validatePage, type PageSettings } from "@/lib/products/playbook-ai/doc/page";
import { VAR_KEY_RE } from "@/lib/products/playbook-ai/doc/limits";

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Font pairs offered. Each uses only bundled OFL fonts (see `src/lib/fonts/noto/LICENSE-FONTS.txt`). */
export const FONT_PAIRS = [
  { id: "sans", label: "Noto Sans throughout", description: "Clean and modern. Headings and text in Noto Sans.", heading: "sans", body: "sans" },
  { id: "classic", label: "Serif headings, sans text", description: "Headings in Noto Serif, text in Noto Sans.", heading: "serif", body: "sans" },
  { id: "serif", label: "Noto Serif throughout", description: "Traditional, suits legal and formal documents.", heading: "serif", body: "serif" },
] as const;
export type FontPairId = (typeof FONT_PAIRS)[number]["id"];
export const FONT_PAIR_IDS: readonly FontPairId[] = FONT_PAIRS.map((p) => p.id);

export const LETTERHEAD_SCOPES = [
  { id: "all", label: "Every page" },
  { id: "first", label: "First page only" },
  { id: "none", label: "No letterhead" },
] as const;
export type LetterheadScope = (typeof LETTERHEAD_SCOPES)[number]["id"];

export const PAGE_FORMATS = [
  { id: "x_of_y", label: "Page 2 of 5" },
  { id: "x_slash_y", label: "2 / 5" },
  { id: "x", label: "2" },
] as const;
export type PageFormat = (typeof PAGE_FORMATS)[number]["id"];

export const LOGO_POSITIONS = ["left", "center", "right"] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];

/** A line printed in the header or footer: fixed text, a company value, or both (`prefix` then the value). Lines whose value is empty are skipped. */
export interface BrandLine {
  /** A `company.*` or `custom.*` variable key, or null for a line of fixed text. */
  key: string | null;
  /** Text printed before the value ("CIN: ") or the whole line when `key` is null. */
  text: string;
  bold: boolean;
}

export const BRAND_LIMITS = {
  maxLines: 6,
  maxLineText: 120,
  maxWatermark: 24,
  maxSignatures: 10,
  maxLabel: 80,
  logoWidthMm: { min: 10, max: 80 },
} as const;

export type BrandAssetKind = "logo" | "signature" | "stamp";

/** A signatory's signature or stamp image slot. Stored securely and used only by later signing features; never drawn on a document here. */
export interface BrandSignatory {
  id: string;
  kind: "signature" | "stamp";
  label: string;
  /** Printed name and designation, for the signature block of this signatory. */
  name: string;
  designation: string;
  /** Id in `pb_brand_assets`, or null while the slot is empty. */
  assetId: string | null;
}

export interface BrandSettings {
  /** Increases on every save; part of the audit trail and of cache keys. */
  revision: number;
  /** The ready-made style this brand started from (`custom` once edited freely). */
  preset: string;
  colors: { primary: string; secondary: string };
  fontPair: FontPairId;
  logo: { assetId: string | null; position: LogoPosition; widthMm: number };
  letterhead: LetterheadScope;
  headerLines: BrandLine[];
  footerLines: BrandLine[];
  footer: { showDocNumber: boolean; showPageNumbers: boolean; align: "left" | "center" | "right"; pageFormat: PageFormat; confidential: boolean };
  /** Default margins and zone heights. Applied to every export so the company's letterhead geometry is consistent. */
  page: PageSettings;
  watermarks: { draft: string; unreviewed: string };
  signatories: BrandSignatory[];
  /** The company details block printed once at the top of page 1 (logo, name, address, registrations, website, contact). */
  identity: IdentitySettings;
}

/** What a company gets before it configures anything: neutral colours, no logo, its own legal name, address and registrations in the header. */
export const DEFAULT_BRAND: BrandSettings = {
  revision: 0,
  preset: "classic",
  colors: { primary: "#1E3A5F", secondary: "#B45309" },
  fontPair: "sans",
  logo: { assetId: null, position: "left", widthMm: 32 },
  letterhead: "all",
  headerLines: [
    { key: "company.legal_name", text: "", bold: true },
    { key: "company.address", text: "", bold: false },
    { key: "company.cin", text: "CIN: ", bold: false },
    { key: "company.gstin", text: "GSTIN: ", bold: false },
  ],
  footerLines: [],
  footer: { showDocNumber: true, showPageNumbers: true, align: "center", pageFormat: "x_of_y", confidential: false },
  // A letterhead with a logo and a few lines needs a taller header zone and top margin than a bare page.
  page: { ...DEFAULT_PAGE, margins: { top: 15, right: 20, bottom: 20, left: 20 }, headerHeightMm: 0, footerHeightMm: 8 },
  watermarks: { draft: "DRAFT", unreviewed: "UNREVIEWED" },
  signatories: [],
  identity: DEFAULT_IDENTITY,
};

/** Namespaces a header or footer line may read from. Party and input data belong to one document, not to the letterhead. */
export const BRAND_LINE_NAMESPACES = ["company", "custom"] as const;

/** WCAG contrast ratio of a #RRGGBB colour against white paper. */
export function contrastOnWhite(hex: string): number {
  const ch = (i: number) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  return 1.05 / (lum + 0.05);
}
export const MIN_CONTRAST = 4.5;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function lines(v: unknown, path: string, errors: string[]): BrandLine[] {
  if (!Array.isArray(v)) { errors.push(`${path} must be a list`); return []; }
  if (v.length > BRAND_LIMITS.maxLines) errors.push(`${path} can have at most ${BRAND_LIMITS.maxLines} lines`);
  const out: BrandLine[] = [];
  v.slice(0, BRAND_LIMITS.maxLines).forEach((l, i) => {
    const p = `${path}[${i + 1}]`;
    if (!isObj(l)) return void errors.push(`${p} must be an object`);
    const key = l.key === null || l.key === undefined || l.key === "" ? null : l.key;
    if (key !== null && (typeof key !== "string" || !VAR_KEY_RE.test(key) || !(BRAND_LINE_NAMESPACES as readonly string[]).includes(key.split(".")[0]))) {
      errors.push(`${p}: the value must be a company or custom variable such as company.legal_name`);
      return;
    }
    const text = typeof l.text === "string" ? l.text : "";
    if (text.length > BRAND_LIMITS.maxLineText) errors.push(`${p}: text is longer than ${BRAND_LIMITS.maxLineText} characters`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) errors.push(`${p}: text contains control characters`);
    if (key === null && text.trim() === "") return void errors.push(`${p}: a line needs text or a company value`);
    out.push({ key, text: text.slice(0, BRAND_LIMITS.maxLineText), bold: l.bold === true });
  });
  return out;
}

const mark = (s: unknown, label: string, max: number, errors: string[]): string => {
  const v = typeof s === "string" ? s.trim() : "";
  if (!v) { errors.push(`${label} must not be empty`); return ""; }
  if (v.length > max || /[\u0000-\u001f\u007f]/.test(v)) errors.push(`${label} must be up to ${max} plain characters`);
  return v.slice(0, max);
};

export type BrandValidation = { ok: true; value: BrandSettings } | { ok: false; errors: string[] };

/**
 * Validates a brand as submitted (the form or an import). `revision` is ignored (the server sets it). Colours must be `#RRGGBB`; margins
 * and zones go through the same page validator as documents; asset ids are only checked for shape (the server checks they belong to the
 * company).
 */
export function validateBrandInput(input: unknown): BrandValidation {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["The brand must be an object."] };
  const c = isObj(input.colors) ? input.colors : {};
  const color = (k: "primary" | "secondary") => {
    const v = c[k];
    if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) { errors.push(`The ${k} colour must look like #1E3A5F`); return DEFAULT_BRAND.colors[k]; }
    return v.toUpperCase();
  };
  const colors = { primary: color("primary"), secondary: color("secondary") };
  if (HEX_COLOR_RE.test(colors.primary) && contrastOnWhite(colors.primary) < MIN_CONTRAST) errors.push("The main colour is too light to read on white paper. Choose a darker colour.");
  const fontPair = FONT_PAIR_IDS.includes(input.fontPair as FontPairId) ? (input.fontPair as FontPairId) : (errors.push(`The font pair must be one of ${FONT_PAIR_IDS.join(", ")}`), DEFAULT_BRAND.fontPair);
  const l = isObj(input.logo) ? input.logo : {};
  const assetOk = (v: unknown) => v === null || v === undefined || v === "" || (typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v));
  if (!assetOk(l.assetId)) errors.push("The logo reference is not valid");
  const position = LOGO_POSITIONS.includes(l.position as LogoPosition) ? (l.position as LogoPosition) : (errors.push("The logo position must be left, center or right"), "left" as LogoPosition);
  const w = l.widthMm;
  const widthMm = typeof w === "number" && Number.isFinite(w) && w >= BRAND_LIMITS.logoWidthMm.min && w <= BRAND_LIMITS.logoWidthMm.max ? Math.round(w * 10) / 10 : (errors.push(`The logo width must be from ${BRAND_LIMITS.logoWidthMm.min} to ${BRAND_LIMITS.logoWidthMm.max} mm`), DEFAULT_BRAND.logo.widthMm);
  const letterhead = LETTERHEAD_SCOPES.some((s) => s.id === input.letterhead) ? (input.letterhead as LetterheadScope) : (errors.push("The letterhead must be every page, first page only, or none"), "all" as LetterheadScope);
  const headerLines = lines(input.headerLines, "Header", errors);
  const footerLines = lines(input.footerLines, "Footer", errors);
  const f = isObj(input.footer) ? input.footer : {};
  const align = f.align === "left" || f.align === "center" || f.align === "right" ? f.align : (errors.push("The footer alignment must be left, center or right"), "center" as const);
  const pageFormat = PAGE_FORMATS.some((p) => p.id === f.pageFormat) ? (f.pageFormat as PageFormat) : "x_of_y";
  const page = validatePage(input.page);
  if (!page.ok) page.errors.forEach((e) => errors.push(`Page: ${e}`));
  const wm = isObj(input.watermarks) ? input.watermarks : {};
  const draft = mark(wm.draft, "The draft watermark", BRAND_LIMITS.maxWatermark, errors).toUpperCase();
  const unreviewed = mark(wm.unreviewed, "The unreviewed watermark", BRAND_LIMITS.maxWatermark, errors).toUpperCase();
  const sigs: BrandSignatory[] = [];
  if (!Array.isArray(input.signatories)) errors.push("Signatories must be a list");
  else {
    if (input.signatories.length > BRAND_LIMITS.maxSignatures) errors.push(`At most ${BRAND_LIMITS.maxSignatures} signature or stamp slots`);
    const ids = new Set<string>();
    input.signatories.slice(0, BRAND_LIMITS.maxSignatures).forEach((s, i) => {
      const p = `Signatory ${i + 1}`;
      if (!isObj(s)) return void errors.push(`${p} must be an object`);
      const id = typeof s.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s.id) && !ids.has(s.id) ? s.id : null;
      if (!id) return void errors.push(`${p} has an invalid or repeated id`);
      ids.add(id);
      const kind = s.kind === "stamp" ? "stamp" : s.kind === "signature" ? "signature" : null;
      if (!kind) return void errors.push(`${p}: the kind must be signature or stamp`);
      if (!assetOk(s.assetId)) return void errors.push(`${p}: the image reference is not valid`);
      const label = typeof s.label === "string" ? s.label.trim() : "";
      if (!label || label.length > BRAND_LIMITS.maxLabel) return void errors.push(`${p}: a label of up to ${BRAND_LIMITS.maxLabel} characters is required`);
      const name = typeof s.name === "string" ? s.name.trim().slice(0, BRAND_LIMITS.maxLabel) : "";
      const designation = typeof s.designation === "string" ? s.designation.trim().slice(0, BRAND_LIMITS.maxLabel) : "";
      sigs.push({ id, kind, label, name, designation, assetId: typeof s.assetId === "string" && s.assetId ? s.assetId : null });
    });
  }
  const idIn = isObj(input.identity) ? input.identity : {};
  const flag = (k: keyof IdentitySettings) => (typeof idIn[k] === "boolean" ? (idIn[k] as boolean) : DEFAULT_IDENTITY[k]);
  const identity: IdentitySettings = { show: flag("show"), logo: flag("logo"), address: flag("address"), gstin: flag("gstin"), cin: flag("cin"), pan: flag("pan"), website: flag("website"), contact: flag("contact") };
  if (errors.length || !page.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      revision: 0, preset: typeof input.preset === "string" && /^[a-z_]{1,24}$/.test(input.preset) ? input.preset : "custom", colors, fontPair, logo: { assetId: typeof l.assetId === "string" && l.assetId ? l.assetId : null, position, widthMm }, letterhead,
      headerLines, footerLines, footer: { showDocNumber: f.showDocNumber !== false, showPageNumbers: f.showPageNumbers !== false, align, pageFormat, confidential: f.confidential === true },
      page: page.value, watermarks: { draft, unreviewed }, signatories: sigs, identity,
    },
  };
}

export { MARGIN_LIMITS };
