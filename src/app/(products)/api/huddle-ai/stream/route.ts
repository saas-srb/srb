import type { NextRequest } from "next/server";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { heartbeat } from "@/lib/products/huddle-ai/presence";
import { resolveVisibleScopes } from "@/lib/products/huddle-ai/access";
import { latestSeq, pull, serializeEvent } from "@/lib/products/huddle-ai/events";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream — the realtime transport for Messenger.
 *
 * The client opens `EventSource("/api/huddle-ai/stream")`. We authenticate from
 * the `messenger_session` cookie, resolve the scopes this user may receive
 * events for, then poll the `chat_events` log on a `seq` cursor and flush any
 * new events as `data:` frames. A `: ping` comment every 25s keeps the
 * connection warm through proxies. The loop unwinds on `request.signal`.
 *
 * This is the *only* file that knows the transport is SSE — `emit()` / `pull()`
 * in `src/lib/huddle-ai/events.ts` are transport-agnostic, so a real WebSocket
 * server is a drop-in replacement here later.
 */

const POLL_INTERVAL_MS = 1500;
const PING_INTERVAL_MS = 25_000;
const SCOPE_REFRESH_MS = 20_000;

export async function GET(request: NextRequest) {
  const user = await getCurrentChatUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Opening a stream counts as being active.
  await heartbeat(user.id).catch(() => {});

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
      let scopes = await resolveVisibleScopes(user);
      let lastPing = Date.now();
      let lastScopeRefresh = Date.now();

      send({ type: "ready", cursor, scopes: scopes.scopeKeys.length });

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
          const events = await pull({ scopeKeys: scopes.scopeKeys, afterSeq: cursor, limit: 300 });
          if (events.length > 0) {
            cursor = events[events.length - 1].seq;
            for (const e of events) send({ type: "event", event: serializeEvent(e) });
          }

          const now = Date.now();
          if (now - lastPing > PING_INTERVAL_MS) {
            comment("ping");
            lastPing = now;
          }
          if (now - lastScopeRefresh > SCOPE_REFRESH_MS) {
            scopes = await resolveVisibleScopes(user);
            lastScopeRefresh = now;
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
