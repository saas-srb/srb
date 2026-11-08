import type { NextRequest } from "next/server";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { getLeadRecord } from "@/lib/lead-management/records";
import { latestSeq, pull, serializeEvent } from "@/lib/products/huddle-ai/events";
import { scopeKey } from "@/lib/products/huddle-ai/event-key";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for the portal side of a lead's Communication
 * Center. Mirrors `/api/huddle-ai/stream`'s poll-and-flush loop, but scoped
 * to a single fixed `lead:<id>` key for the connection's lifetime — unlike
 * Messenger's multi-channel membership there's nothing to refresh mid-stream;
 * if the visitor switches their active lead, the client just reopens the
 * connection (which happens naturally on navigation).
 */

const POLL_INTERVAL_MS = 1500;
const PING_INTERVAL_MS = 25_000;

export async function GET(request: NextRequest) {
  const user = await getCurrentPortalUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const leadId = user.activeLeadId ?? user.leadId;
  const lead = leadId ? await getLeadRecord(leadId) : null;
  if (!lead || lead.externalUserId !== user.id) return new Response("Forbidden", { status: 403 });

  const key = scopeKey({ type: "lead", id: lead._id });
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const comment = (text: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: ${text}\n\n`));
      };

      let cursor = await latestSeq();
      let lastPing = Date.now();
      send({ type: "ready", cursor });

      const onAbort = () => {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", onAbort);

      while (!closed) {
        try {
          const events = await pull({ scopeKeys: [key], afterSeq: cursor, limit: 100 });
          if (events.length > 0) {
            cursor = events[events.length - 1].seq;
            for (const e of events) send({ type: "event", event: serializeEvent(e) });
          }
          const now = Date.now();
          if (now - lastPing > PING_INTERVAL_MS) {
            comment("ping");
            lastPing = now;
          }
        } catch {
          // transient DB hiccup — keep the stream alive, try again next tick
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      request.signal.removeEventListener("abort", onAbort);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
