import type { NextRequest } from "next/server";
import { currentNotifyViewer } from "@/lib/notify/viewer";
import { pullSignals } from "@/lib/notify/signals";
import { hasLevel } from "@/lib/ai/agent/access";
import type { NotifyPanel } from "@/lib/notify/panels";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { canSignIn } from "@/lib/security/account-status";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_MS = 2000;
const PING_MS = 25_000;
/** Ends a stream a little before the host would, so the browser reconnects cleanly (EventSource retries by itself). */
const MAX_LIFETIME_MS = 270_000;
const OVERLAP_MS = 4000;
/** How often a stream checks that the person may still sign in: a suspended or departed person's stream ends within this time. */
const RECHECK_MS = 10_000;

/**
 * Realtime notifications: Server-Sent Events carrying "a notification arrived" / "recount" signals for the signed-in person only.
 * The signed-in account is re-read from its own cookie, never from the URL, and a signal for a product the person's roles no longer
 * open is dropped. Signals carry just enough to show a toast; the bell recounts from `/api/notifications/summary`.
 */
export async function GET(req: NextRequest) {
  const viewer = await currentNotifyViewer(req.nextUrl.searchParams.get("as"));
  if (!viewer) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => { if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); };
      const ping = () => { if (!closed) controller.enqueue(encoder.encode(": ping\n\n")); };
      const finish = () => { if (closed) return; closed = true; try { controller.close(); } catch { /* already closed */ } };
      req.signal.addEventListener("abort", finish);

      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      let since = new Date();
      const seen = new Set<string>();
      const started = Date.now();
      let lastPing = Date.now();
      let lastCheck = Date.now();
      send({ type: "ready" });

      while (!closed && Date.now() - started < MAX_LIFETIME_MS) {
        try {
          if (viewer.actor !== "portal" && Date.now() - lastCheck > RECHECK_MS) {
            lastCheck = Date.now();
            const u = ObjectId.isValid(viewer.user.id) ? await (await getDb()).collection("admin_users").findOne({ _id: new ObjectId(viewer.user.id) } as never, { projection: { status: 1, roles: 1, platformRoleId: 1 } }) : null;
            if (!u || !canSignIn(u as { status?: string; roles?: string[]; platformRoleId?: string })) { finish(); break; }
          }
          const rows = await pullSignals(viewer.user.id, viewer.actor, new Date(since.getTime() - OVERLAP_MS));
          for (const s of rows) {
            if (seen.has(s._id)) continue;
            seen.add(s._id);
            if (s.createdAt > since) since = s.createdAt;
            const allowed = viewer.actor === "portal" || s.panel === "support" || s.panel === "workspace" || s.panel === "platform" || hasLevel(viewer.user.roles, s.panel as NotifyPanel, "any");
            if (allowed) send({ type: s.kind, panel: s.panel, item: s.item ?? null });
          }
          if (seen.size > 500) for (const id of [...seen].slice(0, 250)) seen.delete(id);
          if (Date.now() - lastPing > PING_MS) { ping(); lastPing = Date.now(); }
        } catch {
          /* a transient database error: keep the stream, try again next tick */
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      finish();
    },
    cancel() { closed = true; },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
