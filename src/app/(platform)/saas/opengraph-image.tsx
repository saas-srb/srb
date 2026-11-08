import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";

export const alt = `${SAAS_BRAND.name} — ${SAAS_BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link-preview image of the SaaS product website. */
export default async function OpengraphImage() {
  const c = SAAS_BRAND.colors;
  const logo = await readFile(path.join(process.cwd(), "public", SAAS_BRAND.assets.logoDark)).then((b) => `data:image/png;base64,${b.toString("base64")}`).catch(() => null);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: `linear-gradient(135deg, ${c.ink} 0%, ${c.primaryDark} 55%, #0b8f68 120%)`, color: "#fff", fontFamily: "sans-serif" }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- drawn into the link-preview image
          <img src={logo} width={Math.round(96 * (597 / 189))} height={96} />
        ) : (
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800 }}>
            {SAAS_BRAND.namePrimary}
            <span style={{ marginLeft: 12, color: "#a7f3d0", fontWeight: 600 }}>{SAAS_BRAND.nameAccent}</span>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, maxWidth: 980 }}>The AI business platform that runs itself</div>
          <div style={{ fontSize: 32, color: "#cbd2ea", maxWidth: 900 }}>Sales, HR, finance, projects, procurement, training and your website — automated.</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 26, color: "#a7f3d0" }}>
          <span>CRM</span><span>·</span><span>HR &amp; Payroll</span><span>·</span><span>Finance</span><span>·</span><span>Projects</span><span>·</span><span>AI</span><span>·</span><span>Automation</span>
        </div>
      </div>
    ),
    size,
  );
}
