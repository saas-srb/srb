import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { counterpartHost } from "@/lib/platform/tenancy/surfaces";

/**
 * Lightweight "is a portal user signed in?" for the public header. Returns only a first name — nothing sensitive — and where
 * this company's team signs in (the app host that pairs with the website host being visited), so the header can offer
 * "Company login" separately from the visitor's "User login".
 */
async function handleGET() {
  const user = await getCurrentPortalUser();
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (host?.startsWith("localhost") || host?.includes(".localhost") ? "http" : "https");
  const app = counterpartHost(host, "site");
  return NextResponse.json(
    { signedIn: Boolean(user), firstName: user ? user.displayName.split(" ")[0] : null, companyLoginUrl: app ? `${proto}://${app}/commandos/login` : null },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export const GET = withTransport(handleGET);
