import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { onAppSurface } from "@/lib/platform/saas/request";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getAppsOverview } from "@/lib/apps/overview";

/** The Apps page polls this while a build is running. Directors of the company only. */
export const dynamic = "force-dynamic";

async function handleGET() {
  if (!(await onAppSurface())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getCurrentHubUser();
  if (!user || !user.roles.includes("super_admin")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  return NextResponse.json(await getAppsOverview(await currentCompanyId()), { headers: { "Cache-Control": "no-store" } });
}

export const GET = withTransport(handleGET);
