/**
 * Page geometry for Playbook documents. Pure, client-safe.
 *
 * A4 portrait is the only size exposed today (owner decision), but the size, orientation and margins are STORED on every document and
 * template, so adding Letter or Legal later is a data change: add a row to `PAGE_SIZES`, add its key to `EXPOSED_PAGE_SIZES`.
 * The same table feeds the editor's page view, the PDF (react-pdf `size`) and the DOCX (`w:pgSz`, twips), so the three can never disagree.
 */

export const PAGE_SIZES = {
  A4: {
    label: "A4",
    widthMm: 210,
    heightMm: 297,
    /** Word `w:pgSz` in twentieths of a point (1 inch = 1440). 210 mm = 11906, 297 mm = 16838. */
    widthTwips: 11906,
    heightTwips: 16838,
    /** PDF points (1 pt = 1/72 inch). */
    widthPt: 595.28,
    heightPt: 841.89,
    /** react-pdf `size` value. */
    pdfSize: "A4",
  },
} as const;

export type PageSizeKey = keyof typeof PAGE_SIZES;
export const PAGE_SIZE_KEYS = Object.keys(PAGE_SIZES) as PageSizeKey[];
/** Sizes the UI offers. Only A4 for now. */
export const EXPOSED_PAGE_SIZES: readonly PageSizeKey[] = ["A4"];

export const PAGE_ORIENTATIONS = ["portrait", "landscape"] as const;
export type PageOrientation = (typeof PAGE_ORIENTATIONS)[number];
/** Orientations the UI offers. Portrait only for now. */
export const EXPOSED_ORIENTATIONS: readonly PageOrientation[] = ["portrait"];

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Page settings stored on a document or template. Millimetres everywhere in the model; renderers convert. */
export interface PageSettings {
  size: PageSizeKey;
  orientation: PageOrientation;
  margins: PageMargins;
  /** Height reserved for the header inside the top margin area, in mm (0 = no header zone). */
  headerHeightMm: number;
  /** Height reserved for the footer inside the bottom margin area, in mm (0 = no footer zone). */
  footerHeightMm: number;
}

/** Sensible defaults: 25 mm top and bottom, 20 mm left and right. */
export const DEFAULT_PAGE: PageSettings = {
  size: "A4",
  orientation: "portrait",
  margins: { top: 25, right: 20, bottom: 25, left: 20 },
  headerHeightMm: 12,
  footerHeightMm: 10,
};

/** Safe limits for company-configured margins. */
export const MARGIN_LIMITS = { minMm: 10, maxMm: 50 } as const;
/** The text area must stay at least this wide and this tall. */
export const MIN_TEXT_WIDTH_MM = 100;
export const MIN_TEXT_HEIGHT_MM = 150;
/** Header and footer zones cannot be taller than this. */
export const MAX_ZONE_HEIGHT_MM = 40;

export const mmToTwips = (mm: number) => Math.round((mm / 25.4) * 1440);
export const mmToPt = (mm: number) => (mm / 25.4) * 72;
export const mmToPx = (mm: number, dpi = 96) => (mm / 25.4) * dpi;

/** Page width and height in mm after applying orientation. */
export function pageDimensionsMm(p: Pick<PageSettings, "size" | "orientation">): { widthMm: number; heightMm: number } {
  const s = PAGE_SIZES[p.size];
  return p.orientation === "landscape" ? { widthMm: s.heightMm, heightMm: s.widthMm } : { widthMm: s.widthMm, heightMm: s.heightMm };
}

/** The writable area between the margins, in mm. */
export function textAreaMm(p: PageSettings): { widthMm: number; heightMm: number } {
  const d = pageDimensionsMm(p);
  return { widthMm: d.widthMm - p.margins.left - p.margins.right, heightMm: d.heightMm - p.margins.top - p.margins.bottom };
}

/**
 * Checks page settings against the safe limits. The header zone must fit inside the top margin and the footer zone inside the bottom
 * margin, so a letterhead can never push body text off the page.
 */
export function validatePage(p: unknown): { ok: true; value: PageSettings } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const o = (p ?? {}) as Record<string, unknown>;
  const size = typeof o.size === "string" && (PAGE_SIZE_KEYS as string[]).includes(o.size) ? (o.size as PageSizeKey) : null;
  if (!size) errors.push(`page.size must be one of ${PAGE_SIZE_KEYS.join(", ")}`);
  const orientation = typeof o.orientation === "string" && (PAGE_ORIENTATIONS as readonly string[]).includes(o.orientation) ? (o.orientation as PageOrientation) : null;
  if (!orientation) errors.push(`page.orientation must be one of ${PAGE_ORIENTATIONS.join(", ")}`);
  const m = (o.margins ?? {}) as Record<string, unknown>;
  const margin = (k: keyof PageMargins): number => {
    const v = m[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < MARGIN_LIMITS.minMm || v > MARGIN_LIMITS.maxMm) {
      errors.push(`page.margins.${k} must be a number from ${MARGIN_LIMITS.minMm} to ${MARGIN_LIMITS.maxMm} mm`);
      return DEFAULT_PAGE.margins[k];
    }
    return Math.round(v * 10) / 10;
  };
  const margins: PageMargins = { top: margin("top"), right: margin("right"), bottom: margin("bottom"), left: margin("left") };
  const zone = (k: "headerHeightMm" | "footerHeightMm"): number => {
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_ZONE_HEIGHT_MM) {
      errors.push(`page.${k} must be a number from 0 to ${MAX_ZONE_HEIGHT_MM} mm`);
      return DEFAULT_PAGE[k];
    }
    return Math.round(v * 10) / 10;
  };
  const headerHeightMm = zone("headerHeightMm");
  const footerHeightMm = zone("footerHeightMm");
  if (errors.length === 0 && size && orientation) {
    const value: PageSettings = { size, orientation, margins, headerHeightMm, footerHeightMm };
    const area = textAreaMm(value);
    if (area.widthMm < MIN_TEXT_WIDTH_MM) errors.push(`the text area is ${area.widthMm.toFixed(1)} mm wide; it must be at least ${MIN_TEXT_WIDTH_MM} mm`);
    if (area.heightMm < MIN_TEXT_HEIGHT_MM) errors.push(`the text area is ${area.heightMm.toFixed(1)} mm tall; it must be at least ${MIN_TEXT_HEIGHT_MM} mm`);
    if (headerHeightMm > margins.top) errors.push("the header zone must fit inside the top margin");
    if (footerHeightMm > margins.bottom) errors.push("the footer zone must fit inside the bottom margin");
    if (errors.length === 0) return { ok: true, value };
  }
  return { ok: false, errors };
}
