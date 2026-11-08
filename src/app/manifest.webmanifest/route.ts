import { getPwaIdentity } from "@/lib/pwa/identity";

/**
 * The web app manifest of the CURRENT app host (see `lib/pwa/identity.ts`). Website hosts have none (404): only the app is
 * installable. Installable on Android and desktop Chrome/Edge/Brave/Samsung Internet/Opera, iOS and iPadOS Safari
 * ("Add to Home Screen") and macOS Safari ("Add to Dock"); Firefox on Android installs it too.
 */
export const dynamic = "force-dynamic";

const SIZES = [48, 72, 96, 128, 144, 152, 192, 256, 384, 512];

export async function GET() {
  const id = await getPwaIdentity();
  if (!id) return new Response("Not found", { status: 404 });
  const manifest = {
    id: "/commandos",
    name: id.name,
    short_name: id.shortName,
    description: id.description,
    start_url: `${id.startUrl}?source=pwa`,
    scope: "/",
    display: id.display,
    display_override: id.display === "minimal-ui" ? ["minimal-ui", "standalone"] : ["standalone", "minimal-ui"],
    orientation: id.orientation,
    background_color: id.backgroundColor,
    theme_color: id.themeColor,
    lang: "en",
    dir: "ltr",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    icons: [
      ...SIZES.map((s) => ({ src: `/pwa/icons/${s}.png?v=${id.version}`, sizes: `${s}x${s}`, type: "image/png", purpose: "any" })),
      { src: `/pwa/icons/maskable-192.png?v=${id.version}`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `/pwa/icons/maskable-512.png?v=${id.version}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: id.shortcuts.map((s) => ({ name: s.name, short_name: s.name, url: s.url, icons: [{ src: `/pwa/icons/96.png?v=${id.version}`, sizes: "96x96", type: "image/png" }] })),
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=60, s-maxage=60" },
  });
}
