import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { siteGuard } from "@/lib/webpush/api";
import { broadcastsCol } from "@/lib/webpush/store";

export const dynamic = "force-dynamic";

/** Counts a tap on a notification (sent by the website's service worker). Anonymous, only a counter. */
async function handlePOST(req: Request) {
  const blocked = await siteGuard(req, "wp-click", 60);
  if (blocked) return blocked;
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof body?.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await (await broadcastsCol()).updateOne({ _id: body.id }, { $inc: { clicks: 1 } });
  return NextResponse.json({ ok: true });
}

export const POST = withTransport(handlePOST);
