import React from "react";

/** The two-tone wordmark: `namePrimary` in the surrounding text colour, `nameAccent` in the brand accent. */
export interface BrandName {
  namePrimary: string;
  nameAccent: string;
}

/**
 * The internal admin products' wordmark (LMS, HRMS, FMS … sign-in screens and
 * sidebars). The PUBLIC website never uses this — its sections get the brand
 * from CMS → Site Identity (see `SectionRenderContext.brand`).
 */


const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function wordmark(brand: BrandName, key: number) {
  return <span key={key}><span className="text-foreground">{brand.namePrimary}</span><span className="text-primary">{brand.nameAccent}</span></span>;
}

/**
 * Splits a string on every mention of the brand name and re-wraps each one in
 * the two-tone wordmark treatment. Strings without a match pass through
 * unchanged, so this is safe to call on any text.
 */
export function brandify(text: string, brand: BrandName = { namePrimary: "", nameAccent: "" }): React.ReactNode {
  const name = brand.namePrimary + brand.nameAccent;
  if (!name) return text;
  const parts = text.split(new RegExp(`(${escape(name)})`, "g"));
  if (parts.length === 1) return text;
  return parts.map((part, i) => (part === name ? wordmark(brand, i) : part));
}

/** How CMS text marks a brand-styled mention (a plain brand name stays plain). an older spelling used the brand name itself. */
export const BRAND_TOKEN = "[[brand]]";
const TOKEN_RE = /(\[\[[^\]\n]{1,40}\]\])/g;

/**
 * Like `brandify`, but only for occurrences written as the brand token — so
 * CMS text can mix styled and plain mentions in one paragraph. Renders the
 * same markup as `brandify`.
 */
export function brandTokens(text: string, brand: BrandName): React.ReactNode {
  if (!TOKEN_RE.test(text)) return text;
  TOKEN_RE.lastIndex = 0;
  return text.split(TOKEN_RE).map((part, i) => (/^\[\[[^\]\n]{1,40}\]\]$/.test(part) ? wordmark(brand, i) : part));
}
