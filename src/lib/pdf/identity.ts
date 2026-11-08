import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { pdfAccentScope } from "@/lib/pdf/colors-scope";
import { getActiveThemeState } from "@/lib/products/sitecraft-ai/theme";
import { DEFAULT_BRAND } from "@/lib/products/sitecraft-ai/theme-shared";
import { getCompanyBrand } from "@/lib/platform/branding";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import { LOGO_ROUTE, readCompanyLogo } from "@/lib/platform/branding/logo";

/**
 * Whose letterhead a generated PDF carries. Resolved per company before
 * rendering and held in an AsyncLocalStorage scope around the render (React
 * `createContext` isn't allowed in server code), so every document component
 * reads the CURRENT company's name, address and logo — never a hard-coded one.
 */
export interface PdfIdentity {
  name: string;
  legalName: string;
  addressLine: string;
  cityLine: string;
  /** `email · phone · website` */
  contactLine: string;
  /** Two-tone wordmark next to the logo. */
  wordPrimary: string;
  wordAccent: string;
  /** Small caps line under the wordmark (e.g. "TECHNOLOGIES PVT. LTD."), or "". */
  capsLine: string;
  /** Logo as a data URI, or null for text-only. */
  logo: string | null;
}

const pdfIdentityScope = new AsyncLocalStorage<PdfIdentity>();

/** The letterhead identity of the PDF being rendered (by `renderPdf`). */
export function usePdfIdentity(): PdfIdentity {
  const identity = pdfIdentityScope.getStore();
  if (!identity) throw new Error("PDF rendered without an identity — render it with renderPdf()");
  return identity;
}

/** The company's uploaded logo as a data URI (react-pdf embeds it). Null → the PDF renders text-only. */
async function logoDataUri(url: string | null): Promise<string | null> {
  if (!url?.startsWith(LOGO_ROUTE)) return null;
  const logo = await readCompanyLogo(url.slice(LOGO_ROUTE.length)).catch(() => null);
  // react-pdf embeds PNG and JPEG only.
  if (!logo || !/^image\/(png|jpeg)$/.test(logo.contentType)) return null;
  return `data:${logo.contentType};base64,${logo.body.toString("base64")}`;
}

export async function resolvePdfIdentity(): Promise<PdfIdentity> {
  const brand = await getCompanyBrand();
  const c = await getCompanyDetails();
  return {
    name: c.name || brand.name,
    legalName: c.legalName || c.name || brand.name,
    addressLine: [c.addressLine1, c.addressLine2].filter((s) => s?.trim()).join(", "),
    cityLine: [c.city, c.state, c.postalCode].filter((s) => s?.trim()).join(", "),
    contactLine: [c.email, c.phone, c.website?.replace(/^https?:\/\//, "")].filter((s) => s?.trim()).join("  ·  "),
    wordPrimary: brand.namePrimary,
    wordAccent: brand.nameAccent,
    capsLine: "",
    logo: await logoDataUri(brand.logoUrl),
  };
}

/**
 * `renderToBuffer`, with the current company's letterhead identity provided. Use for every PDF.
 * `override` replaces parts of that identity for documents whose issuer isn't
 * the company as set up in HRMS (e.g. SaaS invoices print the platform's
 * billing-settings seller details).
 */
export async function renderPdf(document: ReactElement, override?: Partial<PdfIdentity>): Promise<Buffer> {
  const [base, { tokens }] = await Promise.all([resolvePdfIdentity(), getActiveThemeState()]);
  const identity = { ...base, ...override };
  // The letterhead's accents are the company's active theme — deep accent + primary.
  const accent = { navy: (tokens.brand ?? DEFAULT_BRAND).deep, coral: tokens.colors.primary };
  return pdfAccentScope.run(accent, () => pdfIdentityScope.run(identity, () => renderToBuffer(document as Parameters<typeof renderToBuffer>[0]) as Promise<Buffer>));
}
