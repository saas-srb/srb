import { renderPwaIcon } from "@/lib/pwa/icon";

/** `/pwa/icons/192.png`, `/pwa/icons/maskable-512.png`, … — the installed app's icons for the CURRENT host. */
const ALLOWED = new Set([48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512]);

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = /^(maskable-)?(\d{2,3})\.png$/.exec((await params).file);
  const size = m ? Number(m[2]) : 0;
  if (!m || !ALLOWED.has(size)) return new Response("Not found", { status: 404 });
  const res = await renderPwaIcon(size, Boolean(m[1]));
  res.headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");
  return res;
}
