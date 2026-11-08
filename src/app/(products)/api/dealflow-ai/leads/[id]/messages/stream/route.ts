import type { NextRequest } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { getLeadRecord } from "@/lib/lead-management/records";
import { latestSeq, pull, serializeEvent } from "@/lib/products/huddle-ai/events";
import { scopeKey } from "@/lib/products/huddle-ai/event-key";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for the LMS side of a lead's Communication
 * Center — the staff-side counterpart of `/api/clientos/messages/stream`.
 * Any valid LMS session may open this for any lead (matches the existing
 * no-fine-grained-role convention on the rest of `/dealflow-ai/leads`).
 */

const POLL_INTERVAL_MS = 1500;
const PING_INTERVAL_MS = 25_000;

export async function GET(request: NextRequest, ctx: RouteContext<"/api/dealflow-ai/leads/[id]/messages/stream">) {
  const user = await requireLms("VIEW_LEADS");
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const lead = await getLeadRecord(id);
  if (!lead) return new Response("Not found", { status: 404 });

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
