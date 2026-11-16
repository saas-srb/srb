import { NextResponse } from "next/server";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { titleOfPerson } from "@/lib/platform/organization/title-server";

/** The signed-in person's title for the sidebar footer and menus of every product: ONE answer, from the organization service. */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentHubUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const t = await titleOfPerson(user.id);
  return NextResponse.json({ title: t.title, department: t.department, line: t.line }, { headers: { "Cache-Control": "private, no-store" } });
}
