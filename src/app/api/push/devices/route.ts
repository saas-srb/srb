import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { pushCaller } from "@/lib/push/api";
import { listDevices, removeDevice } from "@/lib/push/store";

export const dynamic = "force-dynamic";

async function handleGET() {
  const who = await pushCaller();
  if (who instanceof NextResponse) return who;
  return NextResponse.json({ devices: await listDevices(who.actor, who.userId) }, { headers: { "Cache-Control": "no-store" } });
}

async function handleDELETE(req: Request) {
  const who = await pushCaller();
  if (who instanceof NextResponse) return who;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await removeDevice(who.actor, who.userId, id);
  return NextResponse.json({ ok: true });
}

export const GET = withTransport(handleGET);
export const DELETE = withTransport(handleDELETE);
