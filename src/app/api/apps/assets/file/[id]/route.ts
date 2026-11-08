import { withTransport } from "@/lib/security/transport";
import { clientIpFrom } from "@/lib/security/ip";
import { NextResponse } from "next/server";
import { onAppSurface } from "@/lib/platform/saas/request";
import { renderAsset } from "@/lib/apps/assets";
import { rateLimit } from "@/lib/push/rate-limit";

/**
 * One generated app asset of the CURRENT company (`/api/apps/assets/file/android-xxhdpi.png`). Public on app hosts: they are the
 * images the app itself shows, and the mobile/desktop builds download them. Rendered on demand, cached by the browser/CDN.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handleGET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await onAppSurface())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ip = clientIpFrom(req.headers);
  if (!rateLimit(`asset:${ip}`, 120, 60_000)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const id = (await params).id.replace(/\.png$/, "");
  const out = await renderAsset(id).catch(() => null);
  if (!out) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(new Uint8Array(out.png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300, s-maxage=300" } });
}

export const GET = withTransport(handleGET);
