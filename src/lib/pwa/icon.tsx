import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCompanyBrand } from "@/lib/platform/branding";
import { getActiveThemeState } from "@/lib/products/sitecraft-ai/theme";
import { brandInitials } from "@/lib/platform/branding/types";
import { LOGO_ROUTE, readCompanyLogo } from "@/lib/platform/branding/logo";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";
import { onSaasHost } from "@/lib/platform/saas/request";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getAppSettings } from "@/lib/pwa/store";

/**
 * The app icon of the CURRENT host: the product's mark on its own hosts; for a company, its logo (Branding), an image it
 * uploaded just for the app, or its initials, on the colours it chose (Workspace → Settings → Mobile app).
 * `maskable` draws the icon on a full-bleed background at 62% size, inside the 80% "safe zone" Android crops to a circle or
 * a rounded square.
 */
let markDataUri: string | null = null;
async function saasMark(): Promise<string> {
  if (!markDataUri) {
    const png = await readFile(path.join(process.cwd(), "public", SAAS_BRAND.assets.mark));
    markDataUri = `data:image/png;base64,${png.toString("base64")}`;
  }
  return markDataUri;
}

async function productIcon(size: number, maskable: boolean): Promise<ImageResponse> {
  const mark = await saasMark();
  if (!maskable) return new ImageResponse(<img src={mark} width={size} height={size} />, { width: size, height: size });
  const inner = Math.round(size * 0.62);
  return frame(size, SAAS_BRAND.colors.primary, <img src={mark} width={inner} height={inner} />);
}

function frame(size: number, background: string, child: React.ReactNode): ImageResponse {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background }}>{child}</div>, { width: size, height: size });
}

async function logoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url?.startsWith(LOGO_ROUTE)) return null;
  const file = await readCompanyLogo(url.slice(LOGO_ROUTE.length)).catch(() => null);
  // The renderer can't draw WebP.
  return file && file.contentType !== "image/webp" ? `data:${file.contentType};base64,${file.body.toString("base64")}` : null;
}

/** Everything needed to draw this company's app artwork. */
export interface IconArt {
  name: string;
  shortName: string;
  /** The logo as a data URI, or null (initials are drawn instead). */
  logo: string | null;
  initials: string;
  primary: string;
  primaryForeground: string;
  /** Background behind the artwork on icons that need one. */
  iconBackground: string;
  initialsColor: string;
  /** Splash / window background and its readable text colour. */
  splashBackground: string;
  splashForeground: string;
}

/** The artwork of the company in scope (a request on its host, or `runAsCompany`), independent of which host asked. */
export async function loadCompanyArt(): Promise<IconArt> {
  const [brand, { tokens }, { settings }] = await Promise.all([getCompanyBrand(), getActiveThemeState(), getAppSettings()]);
  const c = tokens.colors;
  const source = settings.icon.source;
  const logo = source === "initials" ? null : await logoDataUri(source === "custom" ? settings.icon.customUrl : brand.logoUrl);
  const bg = settings.icon.background;
  const iconBackground = bg.mode === "white" ? "#ffffff" : bg.mode === "custom" ? bg.value : logo ? "#ffffff" : c.primary;
  const splashBackground = settings.backgroundColor.mode === "custom" ? settings.backgroundColor.value : c.background;
  return {
    name: brand.name,
    shortName: settings.shortName || brand.name.slice(0, 12),
    logo,
    initials: brandInitials(brand.name || `${brand.namePrimary} ${brand.nameAccent}`) || "•",
    primary: c.primary,
    primaryForeground: c.primaryForeground,
    iconBackground,
    initialsColor: bg.mode === "custom" || bg.mode === "white" ? readableOn(iconBackground) : c.primaryForeground,
    splashBackground,
    splashForeground: readableOn(splashBackground),
  };
}

export async function renderPwaIcon(size: number, maskable = false): Promise<ImageResponse> {
  if ((await onSaasHost()) || (await currentCompanyIdOrNull()) === null) return productIcon(size, maskable);
  return drawIcon(size, await loadCompanyArt(), maskable ? "maskable" : "any");
}

export type IconKind = "any" | "maskable" | "foreground" | "round" | "ios";

/**
 * One icon.
 *  any: the artwork on a rounded square (or the logo as it is);  maskable: full-bleed background, artwork inside the safe zone;
 *  foreground: transparent, for Android adaptive icons (66dp of 108dp);  round: maskable cut to a circle;
 *  ios: opaque full-bleed square (iOS rounds the corners itself).
 */
export function drawIcon(size: number, art: IconArt, kind: IconKind): ImageResponse {
  const glyph = (box: number) =>
    art.logo ? <img src={art.logo} width={box} height={box} style={{ objectFit: "contain" }} /> : <div style={{ display: "flex", color: art.initialsColor, fontSize: Math.round(box * 0.62), fontWeight: 800 }}>{art.initials}</div>;

  if (kind === "any") {
    if (art.logo) return new ImageResponse(<img src={art.logo} width={size} height={size} style={{ objectFit: "contain" }} />, { width: size, height: size });
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: art.iconBackground, color: art.initialsColor, fontSize: Math.round(size * 0.46), fontWeight: 800, borderRadius: Math.round(size * 0.22) }}>{art.initials}</div>,
      { width: size, height: size },
    );
  }
  if (kind === "foreground") {
    const box = Math.round(size * 0.61);
    return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>{art.logo ? glyph(box) : <div style={{ display: "flex", width: box, height: box, alignItems: "center", justifyContent: "center", background: art.iconBackground, color: art.initialsColor, borderRadius: Math.round(box * 0.22), fontSize: Math.round(box * 0.46), fontWeight: 800 }}>{art.initials}</div>}</div>, { width: size, height: size });
  }
  const inner = Math.round(size * (kind === "ios" ? 0.72 : 0.62));
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: art.iconBackground, borderRadius: kind === "round" ? "50%" : 0 }}>{glyph(inner)}</div>,
    { width: size, height: size },
  );
}

/** Black or white, whichever reads better on `hex`. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "#111111" : "#ffffff";
}
