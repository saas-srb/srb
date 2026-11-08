import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { pushCaller } from "@/lib/push/api";
import { getPreferences, savePreferences } from "@/lib/push/store";

export const dynamic = "force-dynamic";

async function handleGET() {
  const who = await pushCaller();
  if (who instanceof NextResponse) return who;
  return NextResponse.json({ preferences: await getPreferences(who.actor, who.userId) }, { headers: { "Cache-Control": "no-store" } });
}

async function handlePUT(req: Request) {
  const who = await pushCaller();
  if (who instanceof NextResponse) return who;
  const body = (await req.json().catch(() => null)) as { preferences?: unknown } | null;
  if (!body?.preferences) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  return NextResponse.json({ preferences: await savePreferences(who.actor, who.userId, body.preferences) });
}

export const GET = withTransport(handleGET);
export const PUT = withTransport(handlePUT);
