import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/** The two accent colours of the PDF being rendered — the company's active theme (resolved by `renderPdf`). */
export interface PdfAccent {
  /** Deep accent (headings, rules) — the theme's `--brand-deep`. */
  navy: string;
  /** Primary accent (highlights) — the theme's `--primary`. */
  coral: string;
}

export const pdfAccentScope = new AsyncLocalStorage<PdfAccent>();

/** Neutral fallback when a PDF is rendered outside `renderPdf`. */
export const NEUTRAL_ACCENT: PdfAccent = { navy: "#1f2937", coral: "#4b5563" };
