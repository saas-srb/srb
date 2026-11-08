import { ImageResponse } from "next/og";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getActiveThemeState } from "@/lib/products/sitecraft-ai/theme";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { brandInitials } from "@/lib/platform/branding/types";

export const homeOgImageSize = { width: 1200, height: 630 };

/** The share image's metadata (alt text from CMS → Site Identity → Share image). */
export async function homeOgImageMetadata() {
  // The build only asks for the image ids; the alt text is per company, so it's filled in per request.
  if (!(await currentCompanyIdOrNull())) return [{ id: "default", alt: "", size: homeOgImageSize, contentType: "image/png" }];
  const { shareImage } = await getSiteInfo();
  return [{ id: "default", alt: shareImage.alt, size: homeOgImageSize, contentType: "image/png" }];
}


/**
 * Shared renderer for the home page's opengraph-image and twitter-image
 * route files — both need an identical default export, so the JSX lives
 * here once rather than being duplicated across the two special files.
 */
export async function renderHomeOgImage() {
  // Brand + copy: CMS → Site Identity (brand, share image).
  const { brand, shareImage } = await getSiteInfo();
  // Colours come from the company's active theme (dark palette); the logo is the company's own, else its initials.
  const { tokens } = await getActiveThemeState();
  const PRIMARY = tokens.colorsDark.primary;
  const BACKGROUND = tokens.colorsDark.background;
  const FOREGROUND = tokens.colorsDark.foreground;
  const MUTED = tokens.colorsDark.mutedForeground;
  const logoSrc = brand.logoUrl ? new URL(brand.logoUrl, await companySiteUrl()).toString() : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 88px",
          background: BACKGROUND,
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -160,
            right: -140,
            width: 520,
            height: 520,
            borderRadius: 9999,
            background: PRIMARY,
            opacity: 0.22,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -180,
            left: -120,
            width: 420,
            height: 420,
            borderRadius: 9999,
            background: PRIMARY,
            opacity: 0.14,
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {logoSrc ? (
            <img src={logoSrc} width={64} height={64} style={{ borderRadius: 16 }} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 16, background: PRIMARY, color: tokens.colorsDark.primaryForeground, fontSize: 28, fontWeight: 800 }}>
              {brandInitials(brand.namePrimary + " " + brand.nameAccent)}
            </div>
          )}
          <span style={{ fontSize: 34, fontWeight: 700, color: FOREGROUND, letterSpacing: -0.5 }}>
            {brand.namePrimary + brand.nameAccent}
          </span>
          <span
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: PRIMARY,
              border: `1px solid ${PRIMARY}`,
              borderRadius: 999,
              padding: "6px 16px",
              display: "flex",
            }}
          >
            {shareImage.tag}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 980 }}>
          <span
            style={{
              fontSize: 66,
              fontWeight: 800,
              color: FOREGROUND,
              lineHeight: 1.08,
              letterSpacing: -1,
            }}
          >
            {shareImage.headline}
          </span>
          <span style={{ fontSize: 28, color: MUTED, fontWeight: 400 }}>
            {shareImage.subline}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(128,128,128,0.35)",
            paddingTop: 28,
          }}
        >
          <span style={{ fontSize: 22, color: FOREGROUND, fontWeight: 600 }}>{shareImage.domain}</span>
          <div style={{ display: "flex", gap: 10 }}>
            {shareImage.badges.map((label) => (
              <span
                key={label}
                style={{
                  fontSize: 18,
                  color: MUTED,
                  border: "1px solid rgba(128,128,128,0.45)",
                  borderRadius: 999,
                  padding: "6px 16px",
                  display: "flex",
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...homeOgImageSize }
  );
}
