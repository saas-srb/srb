import type { CSSProperties } from "react";
import { DEFAULT_BRAND, fontStack, type ThemeTokens } from "@/lib/products/sitecraft-ai/theme-shared";
import type { ThemeComponentSelections } from "@/lib/products/sitecraft-ai/component-variants";

/** Theme radius → thumbnail units (the thumbnail is ~1/6 scale, sized in container-query units). */
function miniRadius(radius: string): string {
  const n = parseFloat(radius) || 0;
  const rem = radius.endsWith("px") ? n / 16 : n;
  return `${Math.min(rem * 1.4, 3)}cqw`;
}

/**
 * A miniature, token-accurate "screenshot" of the site in a theme: its
 * palette, fonts, radius and header/hero/footer variants. Scales with its
 * container (all sizes in cqw), so it works at any card width.
 */
export default function ThemeThumbnail({
  tokens,
  components,
  dark = false,
  className,
}: {
  tokens: ThemeTokens;
  components?: ThemeComponentSelections;
  dark?: boolean;
  className?: string;
}) {
  const c = dark ? tokens.colorsDark : tokens.colors;
  const brand = tokens.brand ?? DEFAULT_BRAND;
  const heading = fontStack(tokens.typography?.headingFont);
  const r = miniRadius(tokens.radius);
  const gradient = `linear-gradient(135deg, ${c.primary}, ${brand.gradient})`;
  const line = (w: string, color = c.mutedForeground, h = "1.1cqw"): CSSProperties => ({ width: w, height: h, borderRadius: "1cqw", background: color, opacity: 0.35 });
  const menuHeader = components?.header === "menu";
  const terminalHero = components?.sections?.["page-hero"] === "terminal";
  const footerKind = components?.footer ?? "default";
  const slimFooter = footerKind === "compact" || footerKind === "minimal";
  const centeredHeader = components?.header === "centered";
  const floatingHeader = components?.header === "floating";
  const darkFooter = footerKind === "split";

  return (
    <div
      aria-hidden
      className={className}
      style={{ containerType: "inline-size", aspectRatio: "16 / 10", overflow: "hidden", background: c.background, color: c.foreground, fontFamily: fontStack(tokens.typography?.bodyFont), display: "flex", flexDirection: "column", userSelect: "none" }}
    >
      {/* Header */}
      <div style={{ height: centeredHeader ? "10.5cqw" : floatingHeader ? "6.6cqw" : "8.5cqw", flexShrink: 0, display: "flex", alignItems: "center", gap: centeredHeader ? "0.8cqw" : "2cqw", padding: "0 4.5cqw", ...(floatingHeader ? { margin: "1.4cqw 3cqw 0", borderRadius: "6cqw", border: `1px solid ${c.border}` } : { borderBottom: `1px solid ${c.border}` }), ...(centeredHeader ? { justifyContent: "center", flexDirection: "column" as const, justifyItems: "center" } : {}) }}>
        <span style={{ width: "3.2cqw", height: "3.2cqw", borderRadius: "0.9cqw", background: gradient }} />
        <span style={{ fontFamily: heading, fontWeight: 700, fontSize: "2.5cqw" }}>Brand</span>
        {menuHeader ? (
          <span style={{ marginLeft: "auto", display: "grid", gap: "0.6cqw" }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: "3.2cqw", height: "0.45cqw", borderRadius: "1cqw", background: c.foreground }} />)}
          </span>
        ) : (
          <>
            <span style={{ display: "flex", gap: "2.2cqw", marginLeft: "auto" }}>
              {["7cqw", "6cqw", "8cqw"].map((w, i) => <span key={i} style={line(w, c.foreground, "0.9cqw")} />)}
            </span>
            <span style={{ marginLeft: "2cqw", padding: "0.9cqw 2cqw", borderRadius: r, background: c.primary, color: c.primaryForeground, fontSize: "1.7cqw", fontWeight: 600 }}>Get started</span>
          </>
        )}
      </div>

      {/* Hero */}
      {terminalHero ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.6cqw", background: tokens.colorsDark.background, color: tokens.colorsDark.foreground, backgroundImage: `linear-gradient(${tokens.colorsDark.border} 1px, transparent 1px), linear-gradient(90deg, ${tokens.colorsDark.border} 1px, transparent 1px)`, backgroundSize: "4cqw 4cqw" }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.6cqw", color: tokens.colorsDark.primary }}>~/services/web-apps</span>
          <span style={{ fontFamily: heading, fontWeight: 700, fontSize: "4.6cqw", lineHeight: 1.1, textAlign: "center" }}>
            Build what&apos;s <span style={{ background: gradient, WebkitBackgroundClip: "text", color: "transparent" }}>next</span>
          </span>
          <span style={line("34cqw", tokens.colorsDark.mutedForeground)} />
          <span style={{ padding: "1cqw 2.6cqw", borderRadius: r, background: tokens.colorsDark.primary, color: tokens.colorsDark.primaryForeground, fontSize: "1.7cqw", fontWeight: 600 }}>Start a project</span>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "4cqw", alignItems: "center", padding: "0 4.5cqw" }}>
          <div style={{ display: "grid", gap: "1.7cqw", justifyItems: "start" }}>
            <span style={{ padding: "0.5cqw 1.6cqw", borderRadius: "5cqw", background: c.secondary, color: c.secondaryForeground, fontSize: "1.4cqw", fontWeight: 600 }}>New · 2026</span>
            <span style={{ fontFamily: heading, fontWeight: 700, fontSize: "4.9cqw", lineHeight: 1.08, letterSpacing: "-0.02em" }}>
              Build what&apos;s <span style={{ background: gradient, WebkitBackgroundClip: "text", color: "transparent" }}>next</span>, faster.
            </span>
            <span style={{ display: "grid", gap: "0.9cqw", width: "100%" }}>
              <span style={line("92%")} />
              <span style={line("70%")} />
            </span>
            <span style={{ display: "flex", gap: "1.4cqw" }}>
              <span style={{ padding: "1cqw 2.4cqw", borderRadius: r, background: c.primary, color: c.primaryForeground, fontSize: "1.7cqw", fontWeight: 600 }}>Start a project</span>
              <span style={{ padding: "1cqw 2.4cqw", borderRadius: r, border: `1px solid ${c.border}`, fontSize: "1.7cqw", fontWeight: 600 }}>Our work</span>
            </span>
          </div>
          <div style={{ position: "relative", height: "72%", borderRadius: r, background: gradient }}>
            <div style={{ position: "absolute", left: "-4cqw", bottom: "3cqw", width: "17cqw", padding: "1.4cqw", borderRadius: r, background: c.card, border: `1px solid ${c.border}`, display: "grid", gap: "0.8cqw", boxShadow: "0 1cqw 3cqw rgba(0,0,0,0.12)" }}>
              <span style={{ fontFamily: heading, fontWeight: 700, fontSize: "2.6cqw", color: c.primary }}>98%</span>
              <span style={line("80%", c.cardForeground)} />
            </div>
          </div>
        </div>
      )}

      {/* Feature cards */}
      <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2cqw", padding: "3cqw 4.5cqw", background: c.muted }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ padding: "1.6cqw", borderRadius: r, background: c.card, border: `1px solid ${c.border}`, display: "grid", gap: "0.9cqw" }}>
            <span style={{ width: "3.4cqw", height: "3.4cqw", borderRadius: r, background: i === 1 ? c.accent : c.secondary, border: `1px solid ${c.border}` }} />
            <span style={line("75%", c.cardForeground)} />
            <span style={line("55%")} />
          </div>
        ))}
      </div>

      {/* Footer */}
      {slimFooter ? (
        <div style={{ height: "4cqw", flexShrink: 0, display: "flex", alignItems: "center", gap: "2cqw", padding: "0 4.5cqw", borderTop: `1px solid ${c.border}` }}>
          <span style={line("10cqw")} />
          <span style={{ ...line("16cqw"), marginLeft: "auto" }} />
        </div>
      ) : (
        <div style={{ height: darkFooter ? "8cqw" : "6cqw", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: footerKind === "centered" ? "center" : "space-between", padding: "0 4.5cqw", background: darkFooter ? c.foreground : brand.deep, color: darkFooter ? c.background : "#fff" }}>
          <span style={{ fontFamily: heading, fontWeight: 700, fontSize: "1.9cqw" }}>Let&apos;s build together</span>
          <span style={{ padding: "0.6cqw 1.8cqw", borderRadius: r, background: c.primary, color: c.primaryForeground, fontSize: "1.4cqw", fontWeight: 600 }}>Contact</span>
        </div>
      )}
    </div>
  );
}
