"use client";

import { useText } from "@/components/products/sitecraft-ai/TextContext";
import * as React from "react";

export interface ChatCitation {
  fileId: string;
  docId?: string;
  kind: "website" | "pdf" | "unknown";
  title: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[];
  createdAt: string;
  streaming?: boolean;
  error?: boolean;
  /** This turn originated from / was delivered as voice. */
  voice?: boolean;
}

export interface AssistantDoneInfo {
  text: string;
  messageId: string;
  userMessageId: string;
}

export interface SendOptions {
  voice?: boolean;
  onAssistantDone?: (info: AssistantDoneInfo) => void;
}

export interface ChatSessionSummary {
  sessionId: string;
  title: string;
  messageCount: number;
  startedAt: string;
  lastActivityAt: string;
}

export type PreChatFieldMode = "required" | "optional" | "off";

export interface PreChatFormConfig {
  enabled: boolean;
  title: string;
  description: string;
  fields: { name: PreChatFieldMode; email: PreChatFieldMode; phone: PreChatFieldMode; service: PreChatFieldMode };
  consentText: string;
}

export interface IdentityInput {
  name: string;
  email: string;
  phone: string;
  /** Main Service slug — one of the 5 primary services (see `@/lib/categories`). */
  service: string;
}

/** Fired on `window` whenever the visitor's portal sign-in state may have changed
 *  (e.g. the pre-chat form just auto-created their account), so the header's
 *  Login/Signup ⇄ Dashboard link can refresh without a page reload. */
export const PORTAL_SESSION_CHANGED_EVENT = "portal:session-changed";

export interface VoicePublicConfig {
  enabled: boolean;
  available: boolean;
  streaming: boolean;
  /** "browser" runs Voice Mode on the Web Speech APIs (demo); "elevenlabs" uses server STT/TTS. */
  mode: "browser" | "elevenlabs";
}

export interface ChatPublicConfig {
  available: boolean;
  /** True when the assistant is running the built-in scripted demo (no live model configured). */
  demo: boolean;
  welcomeMessage: string;
  suggestedQuestions: string[];
  maxMessageChars: number;
  preChat: PreChatFormConfig;
  voice: VoicePublicConfig;
}

const DEFAULT_VOICE: VoicePublicConfig = {
  enabled: false,
  available: false,
  streaming: true,
  mode: "elevenlabs",
};

const DEFAULT_PRECHAT = (tx: (key: string) => string): PreChatFormConfig => ({
  enabled: false,
  title: tx("chat.chatProvider.before-we-start"),
  description: "",
  fields: { name: "required", email: "required", phone: "optional", service: "required" },
  consentText: "",
});

type ChatStatus = "idle" | "loading" | "streaming" | "error";

interface ChatContextValue {
  messages: ChatMessage[];
  status: ChatStatus;
  error: string | null;
  config: ChatPublicConfig | null;
  ready: boolean;
  thinking: boolean;
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  switchingSession: boolean;
  identified: boolean;
  visitorName: string | null;
  /** True when the pre-chat form must be completed before chatting. */
  needsIdentification: boolean;
  identify: (data: IdentityInput) => Promise<{ ok: boolean; fieldErrors?: Record<string, string>; portalSignedIn?: boolean }>;
  send: (text: string, opts?: SendOptions) => void;
  /** Appends a local assistant message (not persisted) — used for the Voice Mode greeting. */
  pushAssistantMessage: (content: string, opts?: { voice?: boolean }) => void;
  newConversation: () => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  dismissError: () => void;
}

const ChatContext = React.createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = React.useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within <ChatProvider>");
  return ctx;
}

const DEFAULT_CONFIG = (tx: (key: string) => string): ChatPublicConfig => ({
  available: true,
  demo: false,
  welcomeMessage: tx("chat.chatProvider.hi-ask-me-anything-about-brand"),
  suggestedQuestions: [],
  maxMessageChars: 2000,
  preChat: DEFAULT_PRECHAT(tx),
  voice: DEFAULT_VOICE,
});

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface HistoryMessage {
  _id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  createdAt: string;
  error?: string | null;
  voice?: boolean;
}

function mapHistory(raw: HistoryMessage[]): ChatMessage[] {
  return raw
    .filter((m) => m.content || m.role === "assistant")
    .map((m) => ({
      id: m._id,
      role: m.role,
      content: m.content || (m.error ? "Sorry — something went wrong with that response." : ""),
      citations: m.citations ?? [],
      createdAt: m.createdAt,
      error: Boolean(m.error),
      voice: Boolean(m.voice),
    }));
}

export function ChatProvider({
  children,
  withHistorySidebar = false,
  disablePreChat = false,
}: {
  children: React.ReactNode;
  /** When true, also loads the browser's full conversation list for the sidebar. */
  withHistorySidebar?: boolean;
  /** When true, bypasses the pre-chat form so visitors can chat immediately. */
  disablePreChat?: boolean;
}) {
  const tx = useText();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [status, setStatus] = React.useState<ChatStatus>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [config, setConfig] = React.useState<ChatPublicConfig | null>(null);
  const [ready, setReady] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);
  const [sessions, setSessions] = React.useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(null);
  const [switchingSession, setSwitchingSession] = React.useState(false);
  const [identified, setIdentified] = React.useState(false);
  const [visitorName, setVisitorName] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const refreshSessions = React.useCallback(async () => {
    if (!withHistorySidebar) return;
    try {
      const res = await fetch("/api/chat/sessions", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [withHistorySidebar]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const requests: Promise<Response>[] = [
          fetch("/api/chat/config", { cache: "no-store" }),
          fetch("/api/chat/history", { cache: "no-store" }),
        ];
        if (withHistorySidebar) requests.push(fetch("/api/chat/sessions", { cache: "no-store" }));
        const [cfgRes, histRes, sessRes] = await Promise.all(requests);

        const cfg = cfgRes.ok ? await cfgRes.json() : DEFAULT_CONFIG(tx);
        const hist = histRes.ok ? await histRes.json() : { messages: [], sessionId: null };
        if (cancelled) return;

        setConfig({
          ...DEFAULT_CONFIG(tx),
          ...cfg,
          preChat: { ...DEFAULT_PRECHAT(tx), ...cfg.preChat },
          voice: { ...DEFAULT_VOICE, ...cfg.voice },
        });
        setIdentified(Boolean(cfg.identified));
        setVisitorName(cfg.visitorName ?? null);
        setMessages(mapHistory(hist.messages ?? []));
        setActiveSessionId(hist.sessionId ?? null);
        if (sessRes && sessRes.ok) {
          const sessData = await sessRes.json();
          if (!cancelled) setSessions(sessData.sessions ?? []);
        }
      } catch {
        if (!cancelled) setConfig(DEFAULT_CONFIG(tx));
      } finally {
        if (!cancelled) {
          setStatus("idle");
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [withHistorySidebar, tx]);

  const send = React.useCallback(
    (raw: string, opts?: SendOptions) => {
      const text = raw.trim();
      if (!text || status === "streaming") return;

      setError(null);
      setStatus("streaming");
      setThinking(true);

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: text,
        citations: [],
        createdAt: new Date().toISOString(),
        voice: opts?.voice,
      };
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          citations: [],
          createdAt: new Date().toISOString(),
          streaming: true,
          voice: opts?.voice,
        },
      ]);

      const patchAssistant = (patch: Partial<ChatMessage>) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));

      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              message: text,
              voice: opts?.voice ?? undefined,
              sourcePage: typeof window !== "undefined" ? window.location.pathname : undefined,
            }),
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            const payload = await res.json().catch(() => ({}));
            const msg = payload.error ?? "The assistant is unavailable right now. Please try again.";
            setMessages((prev) => prev.filter((m) => m.id !== assistantId));
            if (payload.needsIdentification) setIdentified(false);
            setError(payload.needsIdentification ? null : msg);
            setStatus(payload.needsIdentification ? "idle" : "error");
            setThinking(false);
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let acc = "";

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
              const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
              if (!dataLine) continue;
              let evt: Record<string, unknown>;
              try {
                evt = JSON.parse(dataLine.slice(5).trim());
              } catch {
                continue;
              }
              if (evt.type === "session" && typeof evt.sessionId === "string") {
                setActiveSessionId(evt.sessionId);
              } else if (evt.type === "delta" && typeof evt.text === "string") {
                acc += evt.text;
                setThinking(false);
                patchAssistant({ content: acc, streaming: true });
              } else if (evt.type === "done") {
                const resolvedId = typeof evt.messageId === "string" ? evt.messageId : assistantId;
                patchAssistant({
                  id: resolvedId,
                  content: acc,
                  citations: Array.isArray(evt.citations) ? (evt.citations as ChatCitation[]) : [],
                  streaming: false,
                });
                if (opts?.onAssistantDone && acc.trim()) {
                  opts.onAssistantDone({
                    text: acc,
                    messageId: resolvedId,
                    userMessageId: typeof evt.userMessageId === "string" ? evt.userMessageId : "",
                  });
                }
              } else if (evt.type === "error") {
                patchAssistant({
                  content: acc || (typeof evt.message === "string" ? evt.message : "Something went wrong."),
                  streaming: false,
                  error: true,
                });
              }
            }
          }
          setStatus("idle");
          setThinking(false);
          patchAssistant({ streaming: false });
          void refreshSessions();
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, streaming: false, error: true, content: m.content || "Connection lost. Please try again." }
                : m
            )
          );
          setStatus("error");
          setThinking(false);
        } finally {
          abortRef.current = null;
        }
      })();
    },
    [status, refreshSessions]
  );

  const pushAssistantMessage = React.useCallback(
    (content: string, opts?: { voice?: boolean }) => {
      const text = content.trim();
      if (!text) return;
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: text,
          citations: [],
          createdAt: new Date().toISOString(),
          voice: opts?.voice,
        },
      ]);
    },
    []
  );

  const newConversation = React.useCallback(async () => {
    abortRef.current?.abort();
    // If we're already on an empty chat, don't spawn another.
    if (messages.length === 0 && activeSessionId) {
      setError(null);
      return;
    }
    try {
      const res = await fetch("/api/chat/sessions", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setActiveSessionId(data.session?.sessionId ?? null);
      }
    } catch {
      /* best-effort; still clear the UI */
    }
    setMessages([]);
    setError(null);
    setStatus("idle");
    setThinking(false);
    void refreshSessions();
  }, [messages.length, activeSessionId, refreshSessions]);

  const switchSession = React.useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionId || switchingSession) return;
      abortRef.current?.abort();
      setSwitchingSession(true);
      setError(null);
      try {
        const actRes = await fetch(`/api/chat/sessions/${sessionId}/activate`, { method: "POST" });
        if (!actRes.ok) throw new Error("activate failed");
        const histRes = await fetch("/api/chat/history", { cache: "no-store" });
        const hist = histRes.ok ? await histRes.json() : { messages: [] };
        setMessages(mapHistory(hist.messages ?? []));
        setActiveSessionId(sessionId);
        setStatus("idle");
      } catch {
        setError("Couldn't open that conversation. Please try again.");
      } finally {
        setSwitchingSession(false);
      }
    },
    [activeSessionId, switchingSession]
  );

  const renameSession = React.useCallback(async (sessionId: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setSessions((prev) => prev.map((s) => (s.sessionId === sessionId ? { ...s, title: clean } : s)));
    try {
      await fetch(`/api/chat/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: clean }),
      });
    } catch {
      /* optimistic; a later refresh will reconcile */
    }
  }, []);

  const deleteSession = React.useCallback(
    async (sessionId: string) => {
      const remaining = sessions.filter((s) => s.sessionId !== sessionId);
      setSessions(remaining);
      try {
        await fetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
      } catch {
        /* ignore */
      }
      if (sessionId === activeSessionId) {
        if (remaining.length > 0) {
          await switchSession(remaining[0].sessionId);
        } else {
          await newConversation();
        }
      }
    },
    [sessions, activeSessionId, switchSession, newConversation]
  );

  const identify = React.useCallback(
    async (data: IdentityInput): Promise<{ ok: boolean; fieldErrors?: Record<string, string>; portalSignedIn?: boolean }> => {
      try {
        const res = await fetch("/api/chat/identify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errs = json.fields && Object.keys(json.fields).length > 0
            ? json.fields
            : { general: json.error || "Unable to start chat. Please try again." };
          return { ok: false, fieldErrors: errs };
        }
        setIdentified(true);
        setVisitorName(json.name ?? data.name ?? null);
        // The pre-chat submission may have just created (and signed the visitor
        // into) their portal account — let the header know to swap Login/Signup
        // for Dashboard, without leaving this chat window or reloading.
        if (json.portalSignedIn && typeof window !== "undefined") {
          window.dispatchEvent(new Event(PORTAL_SESSION_CHANGED_EVENT));
        }
        return { ok: true, portalSignedIn: Boolean(json.portalSignedIn) };
      } catch {
        return { ok: false, fieldErrors: { email: "Network error. Please try again." } };
      }
    },
    []
  );

  const dismissError = React.useCallback(() => setError(null), []);

  const needsIdentification = !disablePreChat && Boolean(config?.preChat?.enabled) && !identified;

  const value = React.useMemo<ChatContextValue>(
    () => ({
      messages,
      status,
      error,
      config,
      ready,
      thinking,
      sessions,
      activeSessionId,
      switchingSession,
      identified,
      visitorName,
      needsIdentification,
      identify,
      send,
      pushAssistantMessage,
      newConversation,
      switchSession,
      renameSession,
      deleteSession,
      dismissError,
    }),
    [
      messages,
      status,
      error,
      config,
      ready,
      thinking,
      sessions,
      activeSessionId,
      switchingSession,
      identified,
      visitorName,
      needsIdentification,
      identify,
      send,
      pushAssistantMessage,
      newConversation,
      switchSession,
      renameSession,
      deleteSession,
      dismissError,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
