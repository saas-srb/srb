import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { pushCaller } from "@/lib/push/api";
import { pushToUsers } from "@/lib/push/send";
import { pushConfigured } from "@/lib/push/vapid";
import { rateLimit } from "@/lib/push/rate-limit";

export const dynamic = "force-dynamic";

/** Sends a test notification to the signed-in person's own devices. It is sent as an "alert", which ignores category choices and quiet hours, so it always arrives. */
async function handlePOST() {
  const who = await pushCaller();
  if (who instanceof NextResponse) return who;
  if (!(await pushConfigured())) return NextResponse.json({ error: "Push notifications aren't enabled on this server." }, { status: 503 });
  if (!rateLimit(`${who.actor}:${who.userId}`, 5, 60_000)) return NextResponse.json({ error: "Please wait a minute before sending another test." }, { status: 429 });
  const delivered = await pushToUsers(who.actor, [who.userId], {
    category: "alerts", // a test must arrive even in quiet hours or with a category off; "alerts" is the one that ignores both
    title: "Notifications are working",
    body: "You will get updates like this on this device.",
    url: who.actor === "portal" ? "/clientos/notifications" : "/commandos/notifications",
    tag: "push-test",
  });
  return delivered > 0 ? NextResponse.json({ ok: true, delivered }) : NextResponse.json({ error: "No device could be reached. Turn notifications on for this device first." }, { status: 409 });
}

export const POST = withTransport(handlePOST);
