import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { currentNotifyViewer } from "@/lib/notify/viewer";
import { unreadForPortal, unreadForStaff } from "@/lib/notify/counts";

export const dynamic = "force-dynamic";

/** Unread counts per product for the signed-in person (only products they can open). Used by every bell on load, focus and reconnect. */
async function handleGET(req: NextRequest) {
  const v = await currentNotifyViewer(req.nextUrl.searchParams.get("as"));
  if (!v) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const unread = v.actor === "portal" ? await unreadForPortal(v.user.id) : await unreadForStaff(v.user);
  return NextResponse.json({ unread }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withTransport(handleGET);
