import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FontPairId, LetterheadScope } from "@/lib/products/playbook-ai/brand/types";
import { FONT_PAIRS } from "@/lib/products/playbook-ai/brand/types";
import type { HighlightColor, TextColor } from "@/lib/products/playbook-ai/doc/types";
import { PAGE_SIZES, mmToPt, mmToTwips, pageDimensionsMm, textAreaMm, type PageSettings } from "@/lib/products/playbook-ai/doc/page";

/**
 * Style tokens: ONE set of fonts, sizes, spacing and colours that both the PDF and the DOCX renderer read, so the two cannot drift apart.
 * Brand colours come from the company (validated `#RRGGBB`); everything else is fixed here. Server-only.
 */

export type FamilyKey = "sans" | "serif";
export type FontFace = "regular" | "bold" | "italic" | "boldItalic";
/** The bundled families. `pdf` is the name registered with react-pdf; `name` is what Word shows. */
export const FAMILIES: Record<FamilyKey, { name: string; pdf: string; files: Record<FontFace, string> }> = {
  sans: { name: "Noto Sans", pdf: "NotoSans", files: { regular: "NotoSans-Regular.ttf", bold: "NotoSans-Bold.ttf", italic: "NotoSans-Italic.ttf", boldItalic: "NotoSans-BoldItalic.ttf" } },
  serif: { name: "Noto Serif", pdf: "NotoSerif", files: { regular: "NotoSerif-Regular.ttf", bold: "NotoSerif-Bold.ttf", italic: "NotoSerif-Italic.ttf", boldItalic: "NotoSerif-BoldItalic.ttf" } },
};
/** Default body family (kept for callers that do not choose a pair). */
export const FONT_FAMILY = FAMILIES.sans.name;
export const FONT_DIR = process.env.PLAYBOOK_FONT_DIR || path.join(process.cwd(), "src/lib/fonts/noto");
export const fontPath = (face: FontFace, family: FamilyKey = "sans") => path.join(FONT_DIR, FAMILIES[family].files[face]);
export const readFont = (face: FontFace, family: FamilyKey = "sans"): Buffer => readFileSync(fontPath(face, family));

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export interface BrandColors { primary: string; accent: string; text: string; muted: string; rule: string }

export interface RenderLogo {
  /** PNG or JPEG bytes (convert other formats when the logo is uploaded). */
  bytes: Uint8Array;
  align: "left" | "center" | "right";
  /** Printed width in mm; the height follows the image's own proportions. */
  widthMm: number;
}

/** What the renderers need to know about the company's brand. The brand store (A7) fills this; the defaults are neutral, not SelfRun's. */
export interface RenderBrand {
  colors?: Partial<BrandColors>;
  /** One of the bundled font pairs; "sans" when absent. */
  fontPair?: FontPairId;
  /** Where the header (logo and letterhead lines) is printed. Default every page. */
  letterhead?: LetterheadScope;
  logo?: RenderLogo;
  /** One line printed in the footer zone under the document's own footer (registered office, CIN, GSTIN built from the company profile). */
  footerText?: string;
}

export const DEFAULT_COLORS: BrandColors = { primary: "#1E3A5F", accent: "#B45309", text: "#1F2937", muted: "#6B7280", rule: "#CBD5E1" };

export interface StyleTokens {
  /** Body font family name (what Word shows). */
  fontFamily: string;
  /** Which bundled family the body and the headings use. */
  fonts: { body: FamilyKey; heading: FamilyKey };
  basePt: number;
  lineHeight: number;
  paragraphAfterPt: number;
  colors: BrandColors & { red: string; green: string; blue: string; tableHeaderBg: string; tableBorder: string; flagged: string };
  heading: Record<1 | 2 | 3 | 4, { pt: number; beforePt: number; afterPt: number; color: "primary" | "text" }>;
  callout: Record<"info" | "warning" | "important", { bg: string; border: string }>;
  highlight: Record<HighlightColor, string>;
  /** Indentation of clauses in mm: where the label starts and where the text starts, per level. */
  clause: Record<1 | 2 | 3, { labelMm: number; textMm: number }>;
  listIndentMm: number;
  listMarkerMm: number;
  cellPaddingPt: number;
  signatureGapMm: number;
  gapMm: number;
  page: {
    widthMm: number; heightMm: number; widthPt: number; heightPt: number; widthTwips: number; heightTwips: number;
    textWidthMm: number; textWidthPt: number; textWidthTwips: number;
    margins: { top: number; right: number; bottom: number; left: number };
    headerHeightMm: number; footerHeightMm: number;
  };
}

const pick = (v: string | undefined, d: string) => (v && HEX_RE.test(v) ? v.toUpperCase() : d);

/** Pure; throws nothing. Invalid brand colours fall back to the defaults. */
export function buildTokens(page: PageSettings, brand?: RenderBrand): StyleTokens {
  const c = brand?.colors ?? {};
  const dim = pageDimensionsMm(page);
  const area = textAreaMm(page);
  const base = PAGE_SIZES[page.size];
  const landscape = page.orientation === "landscape";
  const pair = FONT_PAIRS.find((p) => p.id === brand?.fontPair) ?? FONT_PAIRS[0];
  return {
    fontFamily: FAMILIES[pair.body].name,
    fonts: { body: pair.body, heading: pair.heading },
    basePt: 10.5,
    lineHeight: 1.4,
    paragraphAfterPt: 6,
    colors: {
      primary: pick(c.primary, DEFAULT_COLORS.primary), accent: pick(c.accent, DEFAULT_COLORS.accent), text: pick(c.text, DEFAULT_COLORS.text),
      muted: pick(c.muted, DEFAULT_COLORS.muted), rule: pick(c.rule, DEFAULT_COLORS.rule),
      red: "#B91C1C", green: "#15803D", blue: "#1D4ED8", tableHeaderBg: "#EEF2F7", tableBorder: "#CBD5E1", flagged: "#FDE047",
    },
    heading: {
      1: { pt: 20, beforePt: 0, afterPt: 10, color: "primary" },
      2: { pt: 15, beforePt: 14, afterPt: 6, color: "primary" },
      3: { pt: 12.5, beforePt: 10, afterPt: 4, color: "text" },
      4: { pt: 11, beforePt: 8, afterPt: 3, color: "text" },
    },
    callout: {
      info: { bg: "#EFF6FF", border: "#3B82F6" },
      warning: { bg: "#FFFBEB", border: "#F59E0B" },
      important: { bg: "#FEF2F2", border: "#EF4444" },
    },
    highlight: { yellow: "#FEF08A", green: "#BBF7D0", blue: "#BFDBFE", pink: "#FBCFE8" },
    clause: { 1: { labelMm: 0, textMm: 10 }, 2: { labelMm: 10, textMm: 22 }, 3: { labelMm: 22, textMm: 32 } },
    listIndentMm: 6,
    listMarkerMm: 6,
    cellPaddingPt: 4,
    signatureGapMm: 14,
    gapMm: 3,
    page: {
      widthMm: dim.widthMm, heightMm: dim.heightMm,
      widthPt: landscape ? base.heightPt : base.widthPt, heightPt: landscape ? base.widthPt : base.heightPt,
      widthTwips: landscape ? base.heightTwips : base.widthTwips, heightTwips: landscape ? base.widthTwips : base.heightTwips,
      textWidthMm: area.widthMm, textWidthPt: mmToPt(area.widthMm), textWidthTwips: mmToTwips(area.widthMm),
      margins: page.margins, headerHeightMm: page.headerHeightMm, footerHeightMm: page.footerHeightMm,
    },
  };
}

/** The colour a `color` mark stands for. */
export function textColorHex(t: StyleTokens, c: TextColor): string {
  switch (c) {
    case "default": return t.colors.text;
    case "muted": return t.colors.muted;
    case "primary": return t.colors.primary;
    case "accent": return t.colors.accent;
    case "red": return t.colors.red;
    case "green": return t.colors.green;
    case "blue": return t.colors.blue;
  }
}

/** Where the header and footer zones sit, in mm, so PDF and DOCX place them identically. Body text never starts above the top margin when the header fits. */
export function zoneGeometry(t: StyleTokens) {
  const { margins, headerHeightMm, footerHeightMm } = t.page;
  return {
    headerTopMm: Math.max(margins.top - headerHeightMm - t.gapMm, 5),
    footerBottomMm: Math.max(margins.bottom - footerHeightMm - t.gapMm, 5),
  };
}
