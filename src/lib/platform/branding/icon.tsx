import { ImageResponse } from "next/og";
import { getCompanyBrand } from "@/lib/platform/branding";
import { getActiveThemeState } from "@/lib/products/sitecraft-ai/theme";
import { brandInitials } from "@/lib/platform/branding/types";
import { LOGO_ROUTE, readCompanyLogo } from "@/lib/platform/branding/logo";

/**
 * The browser-tab / home-screen icon of the CURRENT company: its own logo when
 * it has one, else its initials on the active theme's primary colour.
 */
export async function renderCompanyIcon(size: number): Promise<ImageResponse> {
  const [brand, { tokens }] = await Promise.all([getCompanyBrand(), getActiveThemeState()]);
  // Read the stored file directly and inline it: fetching our own public URL fails in dev / behind a proxy and
  // makes the renderer reject the response ("Unsupported image type").
  let logo: string | null = null;
  if (brand.logoUrl?.startsWith(LOGO_ROUTE)) {
    const file = await readCompanyLogo(brand.logoUrl.slice(LOGO_ROUTE.length)).catch(() => null);
    if (file && file.contentType !== "image/webp") logo = `data:${file.contentType};base64,${file.body.toString("base64")}`;
  }
  const c = tokens.colors;
  return new ImageResponse(
    logo ? (
      <img src={logo} width={size} height={size} style={{ objectFit: "contain" }} />
    ) : (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: c.primary, color: c.primaryForeground, fontSize: Math.round(size * 0.46), fontWeight: 800, borderRadius: Math.round(size * 0.22) }}>
        {brandInitials(brand.name || `${brand.namePrimary} ${brand.nameAccent}`) || "•"}
      </div>
    ),
    { width: size, height: size }
  );
}
