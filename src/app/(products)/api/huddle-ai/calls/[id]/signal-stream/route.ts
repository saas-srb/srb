import type { NextRequest } from "next/server";
import { requireCallAccess } from "@/lib/products/huddle-ai/call-guard";
import { pull, latestSeq, scopeKey } from "@/lib/products/huddle-ai/events";

export const dynamic = "force-dynamic";

/**
 * Dedicated fast SSE channel for one call's WebRTC signaling. Polls the event
 * log every ~350 ms (vs. the 1.5 s main stream) so offer/answer/ICE round-trips
 * connect a call in a couple of seconds. Only `call_signal` frames addressed to
 * the caller are delivered. Opened by `MeshTransport` on join, closed on leave.
 */
const POLL_MS = 350;
const PING_MS = 20_000;

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let user;
  try {
    ({ user } = await requireCallAccess(id));
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const key = scopeKey({ type: "call", id });
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      let cursor = await latestSeq();
      let lastPing = Date.now();
      send({ type: "ready" });

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
          const events = await pull({ scopeKeys: [key], afterSeq: cursor, limit: 200 });
          if (events.length > 0) {
            cursor = events[events.length - 1].seq;
            for (const e of events) {
              if (e.kind !== "call_signal") continue;
              const p = e.payload as { from?: string; to?: string; type?: string; data?: unknown };
              if (p.to !== user.id) continue;
              send({ type: "signal", from: p.from, signalType: p.type, data: p.data });
            }
          }
          if (Date.now() - lastPing > PING_MS) {
            controller.enqueue(encoder.encode(`: ping\n\n`));
            lastPing = Date.now();
          }
        } catch {
          /* transient — keep the stream alive */
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
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
