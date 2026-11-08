import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { withTransport } from "@/lib/security/transport";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { twoFactorStatus } from "@/lib/security/two-factor";
import { maskEmail } from "@/lib/security/email-otp";

export const dynamic = "force-dynamic";

/** The signed-in Workspace person's own two-step sign-in state, for the profile panel. */
async function handleGET() {
  const user = await getCurrentHubUser();
  if (!user || !ObjectId.isValid(user.id)) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const s = await twoFactorStatus(new ObjectId(user.id));
  return NextResponse.json(
    { method: s.method, enabledAt: s.enabledAt ? s.enabledAt.toISOString() : null, recoveryLeft: s.recoveryLeft, available: s.available, email: maskEmail(user.email) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = withTransport(handleGET);
