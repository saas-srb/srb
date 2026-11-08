import { NextResponse } from "next/server";
import { withTransport } from "@/lib/security/transport";
import { getCurrentHubUser } from "@/lib/hub-auth";

export const dynamic = "force-dynamic";

/** Whether this browser's Workspace sign-in is still valid (it ends when the account signs in on another device on the Free plan). */
async function handleGET() {
  const user = await getCurrentHubUser();
  return NextResponse.json({ active: !!user }, { status: user ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}

export const GET = withTransport(handleGET);
