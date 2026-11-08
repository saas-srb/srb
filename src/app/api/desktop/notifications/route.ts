import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { onAppSurface } from "@/lib/platform/saas/request";
import { listWorkspaceNotifications, workspaceUnreadCount } from "@/lib/products/commandos/notifications";
import { listPortalNotifications, portalUnreadCount } from "@/lib/products/clientos/notifications";

/**
 * What's new for the signed-in person, for the desktop app to show as native notifications. The desktop app can't use Web Push
 * (Electron has no push service), so it asks here every minute or so, with the same session cookie the web app uses.
 * Staff and employees get their workspace feed; portal people get theirs. `after` (ISO time, at most 7 days back) limits it to newer items.
 */
export const dynamic = "force-dynamic";

const WEEK = 7 * 24 * 60 * 60 * 1000;

async function handleGET(req: Request) {
  if (!(await onAppSurface())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const afterRaw = new URL(req.url).searchParams.get("after");
  const parsed = afterRaw ? Date.parse(afterRaw) : NaN;
  const after = Number.isFinite(parsed) ? Math.max(parsed, Date.now() - WEEK) : Date.now() - 60_000;
  const noStore = { "Cache-Control": "no-store" };

  const hub = await getCurrentHubUser();
  if (hub) {
    const [items, unread] = await Promise.all([listWorkspaceNotifications(hub, 30), workspaceUnreadCount(hub)]);
    return NextResponse.json(
      { unread, items: items.filter((n) => !n.read && Date.parse(n.createdAt) > after).map((n) => ({ id: `${n.source}:${n.id}`, title: n.title, body: n.body, url: n.url, createdAt: n.createdAt })) },
      { headers: noStore },
    );
  }
  const portal = await getCurrentPortalUser();
  if (portal) {
    const [rows, unread] = await Promise.all([listPortalNotifications(portal.id, 30), portalUnreadCount(portal.id)]);
    return NextResponse.json(
      { unread, items: rows.filter((n) => !n.read && n.createdAt.getTime() > after).map((n) => ({ id: `portal:${n._id}`, title: n.title, body: n.body ?? "", url: n.link ?? "/clientos/notifications", createdAt: n.createdAt.toISOString() })) },
      { headers: noStore },
    );
  }
  return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: noStore });
}

export const GET = withTransport(handleGET);
