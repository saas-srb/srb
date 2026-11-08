import { NextRequest, NextResponse } from "next/server";
import { withTransport } from "@/lib/security/transport";
import { currentNotifyViewer } from "@/lib/notify/viewer";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { listPanelNotifications, markPanelRead } from "@/lib/notify";
import {
  listWorkspaceNotifications,
  markWorkspaceNotificationRead,
  markAllWorkspaceNotificationsRead,
  isNotificationSource,
  type NotificationSource,
} from "@/lib/products/commandos/notifications";
import {
  listPortalNotifications,
  markPortalRead,
  markAllPortalRead,
  portalUnreadCount,
} from "@/lib/products/clientos/notifications";
import { isNotifyPanel, type NotifyPanel } from "@/lib/notify/panels";

export const dynamic = "force-dynamic";

export interface FeedNotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  priority?: "normal" | "high";
  link?: string | null;
  source?: string;
  sourceLabel?: string | null;
}

async function handleGET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const as = searchParams.get("as");
    const panel = searchParams.get("panel");
    const limit = Math.min(parseInt(searchParams.get("limit") || "40", 10), 100);

    const viewer = await currentNotifyViewer(as);
    if (!viewer) {
      return NextResponse.json(
        { ok: false, error: "Not signed in", items: [], unreadCount: 0 },
        { status: 401 }
      );
    }

    // Portal user (client, student, applicant)
    if (viewer.actor === "portal") {
      const [rows, unread] = await Promise.all([
        listPortalNotifications(viewer.user.id, limit),
        portalUnreadCount(viewer.user.id),
      ]);
      const items: FeedNotificationItem[] = rows.map((r) => ({
        id: r._id,
        title: r.title,
        body: r.body ?? "",
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        read: r.read,
        link: r.link ?? "/clientos/notifications",
        source: "portal",
        sourceLabel: "ClientOS",
      }));
      return NextResponse.json({ ok: true, items, unreadCount: unread });
    }

    // Staff user
    const hubUser = await getCurrentHubUser();
    if (!hubUser) {
      return NextResponse.json(
        { ok: false, error: "Not signed in", items: [], unreadCount: 0 },
        { status: 401 }
      );
    }

    // If specific product panel requested (e.g. "lms", "hrms", "fms", etc.)
    if (panel && isNotifyPanel(panel) && panel !== "workspace") {
      const panelItems = await listPanelNotifications(hubUser.id, panel as NotifyPanel, limit).catch(() => []);
      
      let items: FeedNotificationItem[] = panelItems.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt,
        read: n.read,
        priority: n.priority === "high" ? "high" : "normal",
        link: n.link,
        source: panel,
        sourceLabel: panel.toUpperCase(),
      }));

      // If panel notifications are few or empty, also check workspace feed for relevant product updates
      if (items.length < 5) {
        const wsFeed = await listWorkspaceNotifications(hubUser, limit).catch(() => []);
        const matched = wsFeed.filter((w) => w.source === panel || w.url?.includes(`/${panel}`));
        for (const m of matched) {
          if (!items.some((it) => it.id === m.id)) {
            items.push({
              id: m.id,
              title: m.title,
              body: m.body ?? "",
              createdAt: m.createdAt,
              read: m.read,
              priority: m.priority === "high" ? "high" : "normal",
              link: m.url,
              source: m.source,
              sourceLabel: m.sourceLabel,
            });
          }
        }
      }

      // Sort newest first
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const unreadCount = items.filter((n) => !n.read).length;
      return NextResponse.json({ ok: true, items: items.slice(0, limit), unreadCount });
    }

    // Default / Workspace feed (fanned in from workspace and all modules)
    const wsItems = await listWorkspaceNotifications(hubUser, limit).catch(() => []);
    const items: FeedNotificationItem[] = wsItems.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body ?? "",
      createdAt: n.createdAt,
      read: n.read,
      priority: n.priority === "high" ? "high" : "normal",
      link: n.url,
      source: n.source,
      sourceLabel: n.sourceLabel,
    }));

    const unreadCount = items.filter((n) => !n.read).length;
    return NextResponse.json({ ok: true, items, unreadCount });
  } catch (err) {
    console.error("[notifications/feed] GET error:", err);
    return NextResponse.json({ ok: false, error: "Failed to load notifications", items: [], unreadCount: 0 }, { status: 500 });
  }
}

async function handlePOST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, ids, panel, source, as } = body;

    const viewer = await currentNotifyViewer(as);
    if (!viewer) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }

    if (viewer.actor === "portal") {
      if (action === "markAllRead") {
        await markAllPortalRead(viewer.user.id);
      } else if (Array.isArray(ids) && ids.length > 0) {
        await markPortalRead(ids, viewer.user.id);
      }
      return NextResponse.json({ ok: true });
    }

    const hubUser = await getCurrentHubUser();
    if (!hubUser) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }

    if (action === "markAllRead") {
      if (panel && isNotifyPanel(panel) && panel !== "workspace") {
        await markPanelRead(hubUser.id, panel as NotifyPanel);
      } else {
        await markAllWorkspaceNotificationsRead(hubUser);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "markRead" && Array.isArray(ids)) {
      if (panel && isNotifyPanel(panel) && panel !== "workspace") {
        await markPanelRead(hubUser.id, panel as NotifyPanel, ids);
      } else {
        const s = source && isNotificationSource(source) ? (source as NotificationSource) : "workspace";
        for (const id of ids) {
          await markWorkspaceNotificationRead(hubUser, s, String(id));
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notifications/feed] POST error:", err);
    return NextResponse.json({ ok: false, error: "Failed to update notifications" }, { status: 500 });
  }
}

export const GET = withTransport(handleGET);
export const POST = withTransport(handlePOST);
