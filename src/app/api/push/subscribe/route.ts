import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { describeDevice, isAllowedPushEndpoint, pushCaller } from "@/lib/push/api";
import { subscriptionsCol } from "@/lib/push/store";
import { pushConfigured } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";

const B64URL = /^[A-Za-z0-9_-]{16,200}$/;

/** Registers (or re-assigns to the signed-in person) this browser's push subscription. */
async function handlePOST(req: Request) {
  const who = await pushCaller();
  if (who instanceof NextResponse) return who;
  if (!(await pushConfigured())) return NextResponse.json({ error: "Push notifications aren't enabled on this server." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!isAllowedPushEndpoint(endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || !B64URL.test(p256dh) || !B64URL.test(auth)) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 300);
  const now = new Date();
  // One row per browser install: if another person signed in on this same browser, the device moves to them.
  await (await subscriptionsCol()).updateOne(
    { endpoint },
    {
      $set: { actor: who.actor, userId: who.userId, keys: { p256dh, auth }, device: describeDevice(ua), userAgent: ua, lastSeenAt: now, failures: 0 },
      $setOnInsert: { _id: randomUUID(), createdAt: now, lastSuccessAt: null },
    },
    { upsert: true },
  );
  return NextResponse.json({ ok: true });
}

/** Removes this browser's subscription (the person turned notifications off here, or signed out). */
async function handleDELETE(req: Request) {
  const who = await pushCaller();
  if (who instanceof NextResponse) return who;
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await (await subscriptionsCol()).deleteOne({ endpoint: body.endpoint, actor: who.actor, userId: who.userId });
  return NextResponse.json({ ok: true });
}

export const POST = withTransport(handlePOST);
export const DELETE = withTransport(handleDELETE);
