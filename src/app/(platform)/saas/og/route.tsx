import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";

const size = { width: 1200, height: 630 };

/** A page's link-preview image (Facebook, LinkedIn, WhatsApp, X, Slack, Telegram): drawn with the page's own title. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const title = (q.get("title") ?? SAAS_BRAND.tagline).slice(0, 90);
  const sub = (q.get("sub") ?? SAAS_BRAND.description).slice(0, 140);
  const tag = (q.get("tag") ?? "").slice(0, 40);
  const c = SAAS_BRAND.colors;
  const logo = await readFile(path.join(process.cwd(), "public", SAAS_BRAND.assets.logoDark)).then((b) => `data:image/png;base64,${b.toString("base64")}`).catch(() => null);
  const fs = title.length > 60 ? 56 : title.length > 36 ? 66 : 78;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: `linear-gradient(135deg, ${c.ink} 0%, ${c.primaryDark} 55%, ${c.primary} 100%)`, color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- drawn into the link-preview image
            <img src={logo} width={Math.round(80 * (597 / 189))} height={80} />
          ) : (
            <div style={{ display: "flex", fontSize: 44, fontWeight: 800 }}>{SAAS_BRAND.namePrimary}<span style={{ marginLeft: 12, color: "#a7f3d0" }}>{SAAS_BRAND.nameAccent}</span></div>
          )}
          {tag ? <div style={{ display: "flex", padding: "10px 24px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 26, fontWeight: 700, color: "#a7f3d0" }}>{tag}</div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: fs, fontWeight: 800, lineHeight: 1.08, maxWidth: 1040 }}>{title}</div>
          <div style={{ display: "flex", fontSize: 30, color: "#cbd2ea", maxWidth: 980, lineHeight: 1.3 }}>{sub}</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 26, color: "#a7f3d0" }}>
          <span>{SAAS_BRAND.name}</span><span>·</span><span>Free to start</span><span>·</span><span>Every product in every plan</span>
        </div>
      </div>
    ),
    { ...size, headers: { "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
