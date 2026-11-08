import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { getAvailableBalance } from "@/lib/wallet/redemption";

/** Read-only "how many credits could I apply" for the claim modal's wallet toggle. Signed-in portal users only; never trusted for the actual deduction (the claim route re-checks server-side). */
async function handleGET() {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ signedIn: false, available: 0 });
  const available = await getAvailableBalance(user.id);
  return NextResponse.json({ signedIn: true, email: user.email, available });
}

export const GET = withTransport(handleGET);
