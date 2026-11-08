import "server-only";
import { NEUTRAL_ACCENT, pdfAccentScope } from "@/lib/pdf/colors-scope";

/**
 * Shared colours and sizes for every generated PDF (payslips, invoices, purchase
 * orders, receipts, reports, certificates). Import these instead of redefining
 * them per document so every PDF looks like the same letterhead. Pairs with
 * `src/lib/pdf/layout.tsx`.
 *
 * `navy` and `coral` are the company's ACTIVE THEME colours (deep accent and
 * primary), resolved by `renderPdf` for the document being rendered — read them
 * at render time (`lazyStyles`), never at module load. The rest are neutrals.
 */
export const PDF_COLORS = {
  get navy() {
    return (pdfAccentScope.getStore() ?? NEUTRAL_ACCENT).navy;
  },
  get coral() {
    return (pdfAccentScope.getStore() ?? NEUTRAL_ACCENT).coral;
  },
  ink: "#1f2937",
  mute: "#6b7280",
  line: "#e2e8f0",
  soft: "#f4f6fb",
  white: "#ffffff",
  gold: "#b8860b",
};

/** Shared numeric tokens so spacing / sizing is identical across every document. */
export const PDF_TYPO = {
  pagePadding: 40,
  pagePaddingLandscape: 30,
  baseFont: 9.5,
  logoIcon: 26,
  logoIconCompact: 22,
  wordmark: 15,
  wordmarkCompact: 12,
  rule: 2,
  accentWidth: 90,
  title: 16,
  titleLandscape: 14,
  sectionTitle: 9,
  footer: 7.5,
} as const;
