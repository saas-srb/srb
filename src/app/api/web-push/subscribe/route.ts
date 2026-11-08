import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { describeDevice, isAllowedPushEndpoint } from "@/lib/push/api";
import { pushConfigured } from "@/lib/push/vapid";
import { siteGuard } from "@/lib/webpush/api";
import { getWebPushSettings, subscribersCol } from "@/lib/webpush/store";
import { isTopic, safeSitePath, WEB_PUSH_TOPICS, type WebPushTopic } from "@/lib/webpush/topics";

export const dynamic = "force-dynamic";
const B64URL = /^[A-Za-z0-9_-]{16,200}$/;

/** A visitor agrees to notifications (or changes their topics). Anonymous; keyed by the browser's push endpoint. */
async function handlePOST(req: Request) {
  const blocked = await siteGuard(req, "wp-sub", 20);
  if (blocked) return blocked;
  const settings = await getWebPushSettings();
  if (!settings.enabled || !(await pushConfigured())) return NextResponse.json({ error: "Notifications aren't available on this site." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; topics?: unknown; source?: unknown } | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!isAllowedPushEndpoint(endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || !B64URL.test(p256dh) || !B64URL.test(auth)) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }
  const wanted = Array.isArray(body?.topics) ? (body!.topics as unknown[]).filter(isTopic) : [];
  const topics = (wanted.length ? wanted : (WEB_PUSH_TOPICS as readonly WebPushTopic[])).filter((t) => settings.topics[t]);
  if (topics.length === 0) return NextResponse.json({ error: "Choose at least one topic." }, { status: 400 });

  const ua = (req.headers.get("user-agent") ?? "").slice(0, 300);
  const now = new Date();
  await (await subscribersCol()).updateOne(
    { endpoint },
    {
      $set: { keys: { p256dh, auth }, topics: [...new Set(topics)], device: describeDevice(ua), lastSeenAt: now, failures: 0 },
      $setOnInsert: { _id: randomUUID(), endpoint, createdAt: now, source: safeSitePath(body?.source) },
    },
    { upsert: true },
  );
  return NextResponse.json({ ok: true, topics });
}

/** The visitor turned notifications off. */
async function handleDELETE(req: Request) {
  const blocked = await siteGuard(req, "wp-unsub", 30);
  if (blocked) return blocked;
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await (await subscribersCol()).deleteOne({ endpoint: body.endpoint });
  return NextResponse.json({ ok: true });
}

export const POST = withTransport(handlePOST);
export const DELETE = withTransport(handleDELETE);
