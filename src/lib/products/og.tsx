import { ImageResponse } from "next/og";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { getActiveThemeState } from "@/lib/products/sitecraft-ai/theme";
import { requireProducts } from "@/lib/products/server";
import { valueLine, type StoredProduct } from "@/lib/products/shared";

export const productOgSize = { width: 1200, height: 630 };

/** Share image for /products and /products/<slug>: brand, product name and one-line value on the site's dark card. 404 off the owner's site. */
export async function renderProductOgImage(slug?: string) {
  const products = await requireProducts();
  const product: StoredProduct | undefined = slug ? products.find((p) => p.slug === slug) : undefined;
  const { brand } = await getSiteInfo();
  const dark = (await getActiveThemeState()).tokens.colorsDark;
  const title = product ? product.name : "AI-powered business software";
  const sub = product ? valueLine(product) : "Every product, one connected platform.";
  const kicker = product ? product.category : "Products";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 88px", background: dark.background, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: dark.foreground }}>
          {brand.namePrimary}
          <span style={{ color: dark.primary }}>{brand.nameAccent}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: dark.primary, marginBottom: 20 }}>{kicker}</div>
          <div style={{ display: "flex", fontSize: product ? 68 : 76, fontWeight: 900, lineHeight: 1.1, color: dark.foreground, marginBottom: 24 }}>{title}</div>
          <div style={{ display: "flex", fontSize: 30, lineHeight: 1.4, color: dark.mutedForeground }}>{sub.length > 140 ? `${sub.slice(0, 137)}...` : sub}</div>
        </div>
      </div>
    ),
    { ...productOgSize },
  );
}
