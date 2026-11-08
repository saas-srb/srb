import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { onAppSurface } from "@/lib/platform/saas/request";
import { pushConfigured, vapidPublicKey } from "@/lib/push/vapid";

/** Whether push is available on this host and the public key a browser needs to subscribe. */
export const dynamic = "force-dynamic";

async function handleGET() {
  if (!(await onAppSurface())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const enabled = await pushConfigured();
  return NextResponse.json({ enabled, publicKey: enabled ? await vapidPublicKey() : null }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withTransport(handleGET);
