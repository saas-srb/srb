"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { Conversation, type VoiceConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicAgentView } from "@/lib/products/agentos/calls/public";

type Phase = "idle" | "starting" | "live" | "ending" | "done";
type Line = { id: number; role: "agent" | "user"; text: string };

const languageName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code.replace("_", "-")) ?? code;
  } catch {
    return code;
  }
};

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; code?: string; [k: string]: unknown }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    return await res.json();
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

/**
 * The company's public voice agents: pick one, read the notice, and talk in the browser. The page token comes from the server render and
 * works for one call start; each start returns the token for the next one. The browser never sends a prompt, voice or any override.
 */
export default function AgentDirectory({ agents, token: initialToken, unavailable }: { agents: PublicAgentView[]; token: string | null; unavailable: string | null }) {
  const [chosen, setChosen] = useState<PublicAgentView | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [muted, setMuted] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const token = useRef(initialToken);
  const convRef = useRef<VoiceConversation | null>(null);
  const session = useRef<{ id: string; key: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void convRef.current?.endSession().catch(() => {}); }, []);
  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), [lines]);

  async function report(conversationId: string | null, neverConnected = false) {
    const s = session.current;
    session.current = null;
    if (!s) return;
    // Connected: report the conversation. Never connected: tell the server so the minutes set aside for this call are given back.
    if (conversationId) await post("/api/agentos-public/session/finish", { sessionId: s.id, sessionKey: s.key, conversationId });
    else if (neverConnected) await post("/api/agentos-public/session/finish", { sessionId: s.id, sessionKey: s.key, abort: true });
  }

  async function start() {
    if (!chosen || !token.current || !agreed) return;
    setError(null);
    setNeedsReload(false);
    setLines([]);
    setPhase("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      setError("Your microphone is blocked or unavailable. Allow it for this page, then try again.");
      setPhase("idle");
      return;
    }
    const r = await post("/api/agentos-public/session", { token: token.current, agentId: chosen.id, consent: true, visitor: { name, email, phone } });
    if (!r.ok) {
      setError(r.error ?? "The call couldn't be started.");
      setNeedsReload(r.code === "token");
      setPhase("idle");
      return;
    }
    token.current = String(r.nextToken);
    session.current = { id: String(r.sessionId), key: String(r.sessionKey) };
    const maxSecs = Number(r.maxSecs) || 300;
    let conversationId: string | null = null;
    try {
      const conv = await Conversation.startSession({
        signedUrl: String(r.signedUrl),
        connectionType: "websocket",
        textOnly: false,
        dynamicVariables: r.dynamicVariables as Record<string, string>,
        onConnect: () => setPhase("live"),
        onDisconnect: (d) => {
          if (timer.current) clearTimeout(timer.current);
          if (d.reason === "error") setError(d.message || "The call was interrupted.");
          try { conversationId = convRef.current?.getId() ?? conversationId; } catch { /* the id is read again below */ }
          convRef.current = null;
          setMuted(false);
          setPhase("done");
          void report(conversationId);
        },
        onError: (m) => setError(m || "Something went wrong during the call."),
        onMessage: (m) => {
          const t = m.message?.trim();
          if (t) setLines((p) => [...p, { id: ++lineId.current, role: m.role === "user" ? "user" : "agent", text: t }]);
        },
      });
      convRef.current = conv;
      try { conversationId = conv.getId(); } catch { conversationId = null; }
      // The server caps the call at this length too; ending here keeps the page honest if the connection outlives it.
      timer.current = setTimeout(() => void conv.endSession().catch(() => {}), maxSecs * 1000);
    } catch (err) {
      setError(err instanceof Error && err.message ? `Couldn't connect the call: ${err.message}` : "Couldn't connect the call. Try again.");
      convRef.current = null;
      setPhase("idle");
      void report(null, true);
    }
  }

  async function hangUp() {
    setPhase("ending");
    await convRef.current?.endSession().catch(() => {});
  }

  if (unavailable) return <p role="status" className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{unavailable}</p>;
  if (!agents.length) return <p role="status" className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No voice agents are available on this page right now.</p>;

  const inCall = phase === "live" || phase === "ending";
  return (
    <div className="space-y-6">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Voice agents">
        {agents.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              disabled={inCall || phase === "starting"}
              onClick={() => { setChosen(a); setPhase("idle"); setError(null); setAgreed(false); setLines([]); }}
              aria-pressed={chosen?.id === a.id}
              className={`flex h-full w-full flex-col gap-3 rounded-2xl border bg-card p-4 text-left transition focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 ${chosen?.id === a.id ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
            >
              <span className="flex items-center gap-3">
                {a.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.photoUrl} alt="" width={56} height={56} className="size-14 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="grid size-14 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{a.name.slice(0, 1).toUpperCase()}</span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-foreground">{a.name}</span>
                  {a.jobTitle && <span className="block truncate text-sm text-muted-foreground">{a.jobTitle}</span>}
                </span>
              </span>
              {a.description && <span className="text-sm text-muted-foreground">{a.description}</span>}
              {a.languages.length > 0 && <span className="mt-auto text-xs text-muted-foreground">Speaks {a.languages.map(languageName).join(", ")}</span>}
            </button>
          </li>
        ))}
      </ul>

      {chosen && (
        <section aria-label={`Talk to ${chosen.name}`} className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Talk to {chosen.name}</h2>
          {!inCall && phase !== "done" && (
            <>
              <p className="text-sm text-muted-foreground">{chosen.consent}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5"><Label htmlFor="pv-name">Your name (optional)</Label><Input id="pv-name" value={name} maxLength={60} autoComplete="name" onChange={(e) => setName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="pv-email">Email (optional)</Label><Input id="pv-email" type="email" value={email} maxLength={120} autoComplete="email" onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="pv-phone">Phone (optional)</Label><Input id="pv-phone" type="tel" value={phone} maxLength={24} autoComplete="tel" placeholder="+91 …" onChange={(e) => setPhone(e.target.value)} /></div>
              </div>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>I understand and agree to start the call on these terms.</span>
              </label>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {inCall ? (
              <>
                <Button type="button" variant="destructive" onClick={hangUp} disabled={phase === "ending"}><PhoneOff className="size-4" /> End call</Button>
                <Button type="button" variant="outline" size="icon" aria-label={muted ? "Unmute" : "Mute"} onClick={() => { convRef.current?.setMicMuted(!muted); setMuted(!muted); }}>{muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}</Button>
              </>
            ) : phase === "done" ? (
              <p className="text-sm text-muted-foreground">The call has ended. Thank you for talking with us.</p>
            ) : (
              <Button type="button" onClick={start} disabled={!agreed || phase === "starting" || !initialToken}>
                {phase === "starting" ? <LoaderCircle className="size-4 animate-spin" /> : <Phone className="size-4" />} Start call
              </Button>
            )}
            {phase === "done" && <Button type="button" variant="outline" onClick={() => window.location.reload()}>Call again</Button>}
          </div>
          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}{needsReload && <> <button type="button" className="underline" onClick={() => window.location.reload()}>Reload the page</button></>}</p>}
          {lines.length > 0 && (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-background/60 p-3 text-sm" aria-live="polite">
              {lines.map((l) => (<p key={l.id}><span className="font-semibold">{l.role === "agent" ? chosen.name : "You"}: </span>{l.text}</p>))}
              <div ref={endRef} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
