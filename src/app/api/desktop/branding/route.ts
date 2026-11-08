import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getPwaIdentity } from "@/lib/pwa/identity";

/**
 * Everything the desktop app (Windows, macOS, Linux) needs to look like THIS company's app, read live on every start: name,
 * colours (light and dark), icon, start page and shortcuts. It is the same identity as the mobile app's manifest, so changing
 * Workspace → Settings → Mobile app changes the desktop app too. Public (it holds only what the app's manifest already shows)
 * and only on app hosts.
 */
export const dynamic = "force-dynamic";

async function handleGET(req: Request) {
  const id = await getPwaIdentity();
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const origin = new URL(req.url).origin;
  const hostHeader = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(req.url).protocol.replace(":", "");
  const base = hostHeader ? `${proto}://${hostHeader}` : origin;
  const icon = (size: number) => `${base}/pwa/icons/${size}.png?v=${id.version}`;
  return NextResponse.json(
    {
      app: "selfrun-desktop",
      version: id.version,
      origin: base,
      name: id.name,
      shortName: id.shortName,
      description: id.description,
      themeColor: id.themeColor,
      themeColorDark: id.themeColorDark,
      backgroundColor: id.backgroundColor,
      startUrl: id.startUrl,
      desktop: id.desktop,
      shortcuts: id.shortcuts,
      icons: { 32: icon(48), 128: icon(128), 256: icon(256), 512: icon(512) },
    },
    { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } },
  );
}

export const GET = withTransport(handleGET);
