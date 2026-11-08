"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * The single client-side connection to the Messenger realtime stream. Opens one
 * `EventSource` to `/api/huddle-ai/stream` for the whole product; feature
 * components call `useRealtime().subscribe(handler)` to receive events for the
 * scopes they care about. `EventSource` reconnects on its own; we surface the
 * connection state so the UI can show a subtle "reconnecting" hint.
 *
 * Also owns the presence heartbeat (every 30s + on tab focus) so a single
 * mounted provider keeps the user "online".
 */

export interface RealtimeEvent {
  _id: string;
  seq: number;
  scopeKey: string;
  kind:
    | "message"
    | "message_edit"
    | "message_delete"
    | "reaction"
    | "read"
    | "typing"
    | "presence"
    | "channel"
    | "notification"
    | "call_ring"
    | "call_state"
    | "call_signal";
  payload: Record<string, unknown>;
  actorId: string | null;
  createdAt: string;
}

type Handler = (event: RealtimeEvent) => void;

interface RealtimeContextValue {
  connected: boolean;
  subscribe: (handler: Handler) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const HEARTBEAT_MS = 30_000;

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Set<Handler>>(new Set());

  const subscribe = useCallback((handler: Handler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  // --- SSE connection -------------------------------------------------------
  useEffect(() => {
    let es: EventSource | null = null;
    let closedByUs = false;

    const connect = () => {
      es = new EventSource("/api/huddle-ai/stream");
      es.onopen = () => setConnected(true);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as { type: string; event?: RealtimeEvent };
          if (data.type === "ready") setConnected(true);
          if (data.type === "event" && data.event) {
            for (const h of handlersRef.current) {
              try {
                h(data.event);
              } catch {
                /* a bad handler must not kill the stream */
              }
            }
          }
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        setConnected(false);
        // EventSource retries automatically; if the browser gave up, re-open.
        if (es && es.readyState === EventSource.CLOSED && !closedByUs) {
          setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      closedByUs = true;
      es?.close();
    };
  }, []);

  // --- Presence heartbeat --------------------------------------------------
  useEffect(() => {
    const ping = () => {
      fetch("/api/huddle-ai/presence", { method: "POST", keepalive: true }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <RealtimeContext.Provider value={{ connected, subscribe }}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    // Allow components to render outside a provider (e.g. login) — no-op stream.
    return { connected: false, subscribe: () => () => {} };
  }
  return ctx;
}

/** Subscribe to events for one scope key (`channel:<id>` / `dm:<id>` / `user:<id>`). */
export function useScopeEvents(scopeKey: string | null, handler: Handler) {
  const { subscribe } = useRealtime();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!scopeKey) return;
    return subscribe((event) => {
      if (event.scopeKey === scopeKey) handlerRef.current(event);
    });
  }, [scopeKey, subscribe]);
}
