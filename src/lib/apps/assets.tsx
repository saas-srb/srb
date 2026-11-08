import { ImageResponse } from "next/og";
import JSZip from "jszip";
import { buildCompanyIdentity } from "@/lib/pwa/identity";
import { drawIcon, loadCompanyArt, readableOn, type IconArt, type IconKind } from "@/lib/pwa/icon";

/**
 * Every image and file the company's apps need, drawn from its own name, logo and colours. Nothing here is stored: each asset is
 * rendered when asked for (the Apps page previews, the public asset URLs the mobile and desktop builds download from, and the
 * "asset pack" ZIPs), so a rename or new icon changes all of them at once.
 */
export type AssetGroup = "pwa" | "android" | "ios" | "desktop";

export interface AssetDef {
  /** URL-safe id: `/api/apps/assets/file/<id>.png`. */
  id: string;
  group: AssetGroup;
  /** Where the file goes inside the pack. */
  path: string;
  width: number;
  height: number;
  label: string;
  render: (art: IconArt) => ImageResponse;
}

const icon = (id: string, group: AssetGroup, path: string, size: number, kind: IconKind, label: string): AssetDef => ({ id, group, path, width: size, height: size, label, render: (art) => drawIcon(size, art, kind) });

function splash(width: number, height: number, art: IconArt): ImageResponse {
  const box = Math.round(Math.min(width, height) * 0.36);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: art.splashBackground, color: art.splashForeground }}>
        {art.logo ? <img src={art.logo} width={box} height={box} style={{ objectFit: "contain" }} /> : <div style={{ display: "flex", width: box, height: box, alignItems: "center", justifyContent: "center", background: art.iconBackground, color: art.initialsColor, borderRadius: Math.round(box * 0.22), fontSize: Math.round(box * 0.46), fontWeight: 800 }}>{art.initials}</div>}
        <div style={{ display: "flex", marginTop: Math.round(box * 0.1), fontSize: Math.round(box * 0.2), fontWeight: 700, textAlign: "center" }}>{art.name}</div>
      </div>
    ),
    { width, height },
  );
}

function featureGraphic(art: IconArt): ImageResponse {
  const box = 280;
  const ink = readableOn(art.primary);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 70px", background: `linear-gradient(120deg, ${art.primary}, ${art.primary}cc)`, color: ink }}>
        <div style={{ display: "flex", width: box, height: box, alignItems: "center", justifyContent: "center", background: "#ffffff", borderRadius: 56, marginRight: 56 }}>
          {art.logo ? <img src={art.logo} width={box - 40} height={box - 40} style={{ objectFit: "contain" }} /> : <div style={{ display: "flex", color: art.primary, fontSize: 130, fontWeight: 800 }}>{art.initials}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, lineHeight: 1.05 }}>{art.name}</div>
          <div style={{ display: "flex", fontSize: 34, marginTop: 18, opacity: 0.85 }}>Your business, in your pocket</div>
        </div>
      </div>
    ),
    { width: 1024, height: 500 },
  );
}

const DENSITIES: [string, number][] = [["mdpi", 1], ["hdpi", 1.5], ["xhdpi", 2], ["xxhdpi", 3], ["xxxhdpi", 4]];
const IOS_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];
const PWA_SIZES = [48, 72, 96, 128, 144, 152, 192, 256, 384, 512];
const DESKTOP_SIZES = [1024, 512, 256, 128, 64, 32, 16];

export function assetDefs(): AssetDef[] {
  const defs: AssetDef[] = [];
  for (const s of PWA_SIZES) defs.push(icon(`pwa-${s}`, "pwa", `icons/icon-${s}.png`, s, "any", `Icon ${s}×${s}`));
  defs.push(icon("pwa-maskable-192", "pwa", "icons/maskable-192.png", 192, "maskable", "Maskable 192×192"), icon("pwa-maskable-512", "pwa", "icons/maskable-512.png", 512, "maskable", "Maskable 512×512"));
  defs.push(icon("pwa-apple-180", "pwa", "icons/apple-touch-icon.png", 180, "ios", "Apple touch icon 180×180"), icon("pwa-favicon-32", "pwa", "icons/favicon-32.png", 32, "any", "Favicon 32×32"), icon("pwa-favicon-16", "pwa", "icons/favicon-16.png", 16, "any", "Favicon 16×16"));

  for (const [d, m] of DENSITIES) {
    defs.push(icon(`android-${d}`, "android", `res/mipmap-${d}/ic_launcher.png`, Math.round(48 * m), "maskable", `Launcher ${d} (${Math.round(48 * m)}px)`));
    defs.push(icon(`android-round-${d}`, "android", `res/mipmap-${d}/ic_launcher_round.png`, Math.round(48 * m), "round", `Round ${d}`));
    defs.push(icon(`android-fg-${d}`, "android", `res/mipmap-${d}/ic_launcher_foreground.png`, Math.round(108 * m), "foreground", `Adaptive foreground ${d}`));
  }
  defs.push(icon("android-playstore", "android", "playstore/icon-512.png", 512, "maskable", "Play Store icon 512×512"));
  defs.push({ id: "android-feature", group: "android", path: "playstore/feature-graphic-1024x500.png", width: 1024, height: 500, label: "Play Store feature graphic", render: featureGraphic });
  defs.push({ id: "android-splash", group: "android", path: "res/drawable/splash.png", width: 1080, height: 1920, label: "Splash screen", render: (a) => splash(1080, 1920, a) });

  for (const s of IOS_SIZES) defs.push(icon(`ios-${s}`, "ios", `AppIcon.appiconset/icon-${s}.png`, s, "ios", s === 1024 ? "App Store icon 1024×1024" : `Icon ${s}×${s}`));
  defs.push({ id: "ios-splash", group: "ios", path: "LaunchScreen/splash-2732.png", width: 2732, height: 2732, label: "Launch screen", render: (a) => splash(2732, 2732, a) });

  for (const s of DESKTOP_SIZES) defs.push(icon(`desktop-${s}`, "desktop", `icons/icon-${s}.png`, s, "any", `Icon ${s}×${s}`));
  return defs;
}

/** The preview-worthy subset shown on each tab. */
export const PREVIEW_IDS: Record<AssetGroup, string[]> = {
  pwa: ["pwa-192", "pwa-maskable-192", "pwa-apple-180", "pwa-favicon-32"],
  android: ["android-xxxhdpi", "android-round-xxxhdpi", "android-fg-xxxhdpi", "android-feature", "android-splash"],
  ios: ["ios-180", "ios-1024", "ios-splash"],
  desktop: ["desktop-256", "desktop-64", "desktop-32"],
};

export async function renderAsset(id: string): Promise<{ png: Buffer; def: AssetDef } | null> {
  const def = assetDefs().find((d) => d.id === id);
  if (!def) return null;
  const art = await loadCompanyArt();
  return { png: Buffer.from(await def.render(art).arrayBuffer()), def };
}

// ── packs ────────────────────────────────────────────────────────────────────

const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const IOS_CONTENTS = (author: string): string =>
  JSON.stringify(
    {
      images: [
        { size: "20x20", idiom: "iphone", scale: "2x", filename: "icon-40.png" }, { size: "20x20", idiom: "iphone", scale: "3x", filename: "icon-60.png" },
        { size: "29x29", idiom: "iphone", scale: "2x", filename: "icon-58.png" }, { size: "29x29", idiom: "iphone", scale: "3x", filename: "icon-87.png" },
        { size: "40x40", idiom: "iphone", scale: "2x", filename: "icon-80.png" }, { size: "40x40", idiom: "iphone", scale: "3x", filename: "icon-120.png" },
        { size: "60x60", idiom: "iphone", scale: "2x", filename: "icon-120.png" }, { size: "60x60", idiom: "iphone", scale: "3x", filename: "icon-180.png" },
        { size: "20x20", idiom: "ipad", scale: "1x", filename: "icon-20.png" }, { size: "20x20", idiom: "ipad", scale: "2x", filename: "icon-40.png" },
        { size: "29x29", idiom: "ipad", scale: "1x", filename: "icon-29.png" }, { size: "29x29", idiom: "ipad", scale: "2x", filename: "icon-58.png" },
        { size: "40x40", idiom: "ipad", scale: "1x", filename: "icon-40.png" }, { size: "40x40", idiom: "ipad", scale: "2x", filename: "icon-80.png" },
        { size: "76x76", idiom: "ipad", scale: "1x", filename: "icon-76.png" }, { size: "76x76", idiom: "ipad", scale: "2x", filename: "icon-152.png" },
        { size: "83.5x83.5", idiom: "ipad", scale: "2x", filename: "icon-167.png" },
        { size: "1024x1024", idiom: "ios-marketing", scale: "1x", filename: "icon-1024.png" },
      ],
      info: { version: 1, author },
    },
    null,
    2,
  );

/** Builds the ZIP of every asset of a group (`all` = every group) plus the generated config files and a README. */
export async function buildAssetPack(group: AssetGroup | "all"): Promise<Buffer> {
  const [art, identity] = await Promise.all([loadCompanyArt(), buildCompanyIdentity()]);
  const zip = new JSZip();
  const groups: AssetGroup[] = group === "all" ? ["pwa", "android", "ios", "desktop"] : [group];
  for (const d of assetDefs().filter((x) => groups.includes(x.group))) {
    const png = Buffer.from(await d.render(art).arrayBuffer());
    zip.file(group === "all" ? `${d.group}/${d.path}` : d.path, png);
  }
  const at = (g: AssetGroup, p: string) => (group === "all" ? `${g}/${p}` : p);
  const config = { name: identity.name, shortName: identity.shortName, description: identity.description, themeColor: identity.themeColor, themeColorDark: identity.themeColorDark, backgroundColor: identity.backgroundColor, startUrl: identity.startUrl, shortcuts: identity.shortcuts, generatedAt: new Date().toISOString() };

  if (groups.includes("pwa")) {
    zip.file(at("pwa", "manifest.webmanifest"), JSON.stringify({
      name: identity.name, short_name: identity.shortName, description: identity.description, start_url: identity.startUrl, scope: "/", display: identity.display, orientation: identity.orientation,
      background_color: identity.backgroundColor, theme_color: identity.themeColor,
      icons: [...PWA_SIZES.map((s) => ({ src: `icons/icon-${s}.png`, sizes: `${s}x${s}`, type: "image/png", purpose: "any" })), { src: "icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" }, { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
    }, null, 2));
  }
  if (groups.includes("android")) {
    const c = hexRgb(art.iconBackground);
    zip.file(at("android", "res/values/ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${art.iconBackground}</color>\n    <color name="splash_background">${art.splashBackground}</color>\n    <color name="theme_color">${identity.themeColor}</color>\n</resources>\n`);
    for (const n of ["ic_launcher", "ic_launcher_round"]) zip.file(at("android", `res/mipmap-anydpi-v26/${n}.xml`), `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`);
    zip.file(at("android", "README.txt"), `Android assets for ${identity.name}\nIcon background colour: ${art.iconBackground} (rgb ${c.r}, ${c.g}, ${c.b})\nCopy "res" into app/src/main/res of your Android Studio project. Upload playstore/* to the Play Console.\n`);
  }
  if (groups.includes("ios")) zip.file(at("ios", "AppIcon.appiconset/Contents.json"), IOS_CONTENTS(identity.name));
  zip.file(at(groups[0], "app-config.json"), JSON.stringify(config, null, 2));
  zip.file("README.txt", `${identity.name}: asset pack\nGenerated ${new Date().toISOString()} from the company's own name, logo and colours (Workspace → Settings → Apps).\nGroups in this pack: ${groups.join(", ")}.\n`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
