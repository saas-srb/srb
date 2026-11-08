import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { tabForPortalRole } from "@/lib/offers/constants";

/** Signed-in portal users get their claim form pre-filled (less friction = more completed claims). Anonymous callers get nothing. */
async function handleGET() {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ signedIn: false });
  return NextResponse.json({ signedIn: true, name: user.displayName, email: user.email, phone: user.phone, role: user.role, tab: tabForPortalRole(user.role) });
}

export const GET = withTransport(handleGET);
