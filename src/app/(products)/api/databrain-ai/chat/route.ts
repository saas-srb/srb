import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentIntelligenceUser } from "@/lib/intelligence-auth";
import { executeTurn, prepareTurn } from "@/lib/products/databrain-ai/turn";

// Long-running: several model rounds and queries.
export const maxDuration = 300;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * One question, streamed as SSE: `chat` (conversation id/title), `status`
 * ("Checking permissions…", "Querying Invoices…", "Writing the answer…"), then
 * `done` with the finished blocks (or `error`). Who the user is, what they may
 * read and whose conversation it is are all resolved from the SESSION; the
 * body only carries the question and (optionally) the conversation id.
 */
async function handlePOST(req: NextRequest) {
  const user = await getCurrentIntelligenceUser();
  if (!user) return fail("Your session has expired — please sign in again.", 401);

  let body: { message?: unknown; conversationId?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("That message could not be read.", 400);
  }
  const prep = await prepareTurn(user, body);
  if (!prep.ok) return fail(prep.error, prep.status);

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };
      send({ type: "chat", conversationId: prep.conversation._id, title: prep.conversation.title, isNew: prep.isNew });
      try {
        const res = await executeTurn(user, prep, { signal: abort.signal, onStatus: (value) => send({ type: "status", value }) });
        if (res.ok) send({ type: "done", message: res.message });
        else if (!res.stopped) send({ type: "error", message: res.error });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by the client
          }
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new NextResponse(readable, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}

export const POST = withTransport(handlePOST);
