"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRealtime } from "@/components/products/huddle-ai/RealtimeProvider";
import IncomingCallModal from "@/components/products/huddle-ai/call/IncomingCallModal";
import OngoingCallPip from "@/components/products/huddle-ai/call/OngoingCallPip";

export interface IncomingCall {
  callId: string;
  from: string;
  fromName: string;
  mode: "audio" | "video";
  title: string;
}

interface ActiveCall {
  callId: string;
  title: string;
  mode: "audio" | "video";
}

interface CallContextValue {
  /** The call this tab is currently *in* (set by CallStage on join, cleared on leave). */
  activeCall: ActiveCall | null;
  setActiveCall: (c: ActiveCall | null) => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ currentUserId, children }: { currentUserId: string; children: React.ReactNode }) {
  const { subscribe } = useRealtime();
  const router = useRouter();
  const pathname = usePathname();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const activeRef = useRef<ActiveCall | null>(null);

  useEffect(() => {
    activeRef.current = activeCall;
  }, [activeCall]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.kind === "call_ring") {
          const p = event.payload as Record<string, unknown>;
          const to = p.to as string | undefined;
          const from = p.from as string | undefined;
          const callId = p.callId as string;

          // The ring for user X also lands on X's DM-partners' streams — only
          // show it when it's addressed to me, and never for calls I started.
          if (to !== currentUserId) return;
          if (from === currentUserId) return;
          if (dismissedRef.current.has(callId)) return;
          if (activeRef.current?.callId === callId) return;
          if (pathname === `/huddle-ai/call/${callId}`) return;

          setIncoming({
            callId,
            from: from ?? "",
            fromName: (p.fromName as string) ?? "Someone",
            mode: (p.mode as "audio" | "video") ?? "audio",
            title: (p.title as string) ?? "Call",
          });
        } else if (event.kind === "call_state") {
          const p = event.payload as { action?: string; callId?: string };
          if (p.action === "ended") {
            dismissedRef.current.add(p.callId ?? "");
            setIncoming((cur) => (cur?.callId === p.callId ? null : cur));
            setActiveCall((cur) => (cur?.callId === p.callId ? null : cur));
          }
        }
      }),
    [subscribe, currentUserId, pathname]
  );

  const accept = useCallback(() => {
    if (!incoming) return;
    const id = incoming.callId;
    setIncoming(null);
    router.push(`/huddle-ai/call/${id}`);
  }, [incoming, router]);

  const decline = useCallback(() => {
    if (!incoming) return;
    const id = incoming.callId;
    dismissedRef.current.add(id);
    setIncoming(null);
    fetch(`/api/huddle-ai/calls/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline" }),
    }).catch(() => {});
  }, [incoming]);

  const onCallPage = activeCall && pathname === `/huddle-ai/call/${activeCall.callId}`;

  return (
    <CallContext.Provider value={{ activeCall, setActiveCall }}>
      {children}
      {incoming && <IncomingCallModal call={incoming} onAccept={accept} onDecline={decline} />}
      {activeCall && !onCallPage && (
        <OngoingCallPip
          title={activeCall.title}
          mode={activeCall.mode}
          onOpen={() => router.push(`/huddle-ai/call/${activeCall.callId}`)}
        />
      )}
    </CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) return { activeCall: null, setActiveCall: () => {} };
  return ctx;
}
