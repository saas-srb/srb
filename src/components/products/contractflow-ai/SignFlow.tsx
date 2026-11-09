"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SigningView } from "@/lib/products/contractflow-ai/sign-flow";

/**
 * The public signing screen (B4). Mobile first: one column, large touch targets, nothing hidden behind hover. Steps: 1 read the document,
 * 2 prove who you are with the one-time code, 3 sign (or decline). The server enforces every step; this only guides.
 * Errors are shown in plain words in a live region so a screen reader announces them.
 */
type Api = { ok: boolean; error?: string; title?: string; code?: string; destination?: string; resendAfterSeconds?: number; attemptsLeft?: number; complete?: boolean; retryAfterSeconds?: number };

async function post(token: string, action: string, body: unknown): Promise<Api> {
  try {
    const res = await fetch(`/api/contractflow-ai/sign/${token}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Api;
    return res.ok ? { ...json, ok: true } : { ...json, ok: false, error: json.error ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, error: "We could not reach the server. Check your connection and try again." };
  }
}

const btn = "inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50";
const primary = `${btn} bg-primary text-primary-foreground`;
const secondary = `${btn} border border-border bg-background`;
const field = "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base";

function DrawPad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.lineWidth = 2.5;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#111827";
  }, []);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  return (
    <div className="space-y-2">
      <canvas
        ref={ref}
        role="img"
        aria-label="Signature drawing area. Draw with your finger or mouse. If you prefer, use the Type tab."
        className="h-40 w-full touch-none rounded-lg border border-dashed border-border bg-white"
        onPointerDown={(e) => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const g = ref.current!.getContext("2d")!; const p = pos(e); g.beginPath(); g.moveTo(p.x, p.y); }}
        onPointerMove={(e) => { if (!drawing.current) return; const g = ref.current!.getContext("2d")!; const p = pos(e); g.lineTo(p.x, p.y); g.stroke(); dirty.current = true; }}
        onPointerUp={() => { drawing.current = false; if (dirty.current) onChange(ref.current!.toDataURL("image/png")); }}
        onPointerCancel={() => { drawing.current = false; }}
      />
      <button type="button" className={secondary} onClick={() => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null); }}>Clear</button>
    </div>
  );
}

export default function SignFlow({ token, view }: { token: string; view: SigningView }) {
  const [viewed, setViewed] = useState(view.documentViewed);
  const [verified, setVerified] = useState(view.identityVerified);
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState(view.signerName);
  const [designation, setDesignation] = useState("");
  const [tab, setTab] = useState<"draw" | "type" | "upload">("draw");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [typed, setTyped] = useState(view.signerName);
  const [style, setStyle] = useState(view.typedStyles[0]?.key ?? "script");
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<"signed" | "declined" | null>(null);
  const docUrl = `/sign/${token}/document`;

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try { await fn(); } finally { setBusy(false); }
  }, []);

  if (done) {
    return (
      <div className="space-y-3 text-center" role="status">
        <h2 className="text-lg font-semibold">{done === "signed" ? "Thank you. Your signature is recorded." : "Your answer is recorded."}</h2>
        <p className="text-sm text-muted-foreground">{done === "signed" ? "You will receive the signed copy when everyone has signed. You can close this page." : "The sender has been told you declined. You can close this page."}</p>
      </div>
    );
  }

  const signature = tab === "draw" ? (drawn ? { kind: "drawn", dataUrl: drawn } : null) : tab === "type" ? (typed.trim().length >= 2 ? { kind: "typed", text: typed, style } : null) : uploaded ? { kind: "uploaded", base64: uploaded } : null;
  const canSign = viewed && verified && view.canSignNow && agree && name.trim().length >= 2 && !!signature;

  return (
    <div className="space-y-6">
      <section aria-labelledby="s1" className="space-y-2">
        <h2 id="s1" className="text-base font-semibold">1. Read the document</h2>
        {view.documentAvailable ? (
          <>
            <iframe title={`Document: ${view.title}`} src={docUrl} onLoad={() => setViewed(true)} className="h-[60vh] w-full rounded-lg border bg-white" />
            <div className="flex flex-wrap gap-2">
              <a className={secondary} href={docUrl} target="_blank" rel="noopener noreferrer">Open in a new tab</a>
              <a className={secondary} href={`${docUrl}?download=1`}>Download PDF</a>
            </div>
            <p className="text-xs text-muted-foreground">If the document does not show on your phone, use &ldquo;Open in a new tab&rdquo; or download it.</p>
          </>
        ) : (
          <p className="rounded-lg border p-3 text-sm">The document is not available. Please contact the sender.</p>
        )}
      </section>

      {!view.canSignNow && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="status">It is not your turn yet. {view.waitingFor.join(", ")} must sign first. Open this link again later; you will not need a new one.</p>
      )}

      <section aria-labelledby="s2" className="space-y-2">
        <h2 id="s2" className="text-base font-semibold">2. Confirm it is you</h2>
        {verified ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">Confirmed.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">We send a 6-digit code to the email address{view.channels.hasPhone && view.channels.sms.available ? " or phone number" : ""} this request was sent to.</p>
            {view.channels.hasPhone && view.channels.sms.available && (
              <div role="radiogroup" aria-label="Where to send the code" className="flex gap-2">
                {(["email", "sms"] as const).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={channel === c} className={channel === c ? primary : secondary} onClick={() => setChannel(c)}>{c === "email" ? "Email" : "Text message"}</button>
                ))}
              </div>
            )}
            {!view.channels.sms.available && view.channels.hasPhone && view.channels.sms.reason && <p className="text-xs text-muted-foreground">Text messages are not available: {view.channels.sms.reason}</p>}
            <button type="button" className={secondary} disabled={busy || !view.channels.email.available && channel === "email"} onClick={() => run(async () => {
              const r = await post(token, "otp-send", { channel });
              if (r.ok) { setSentTo(r.destination ?? null); setMsg(`Code sent to ${r.destination}. It works for 10 minutes.`); } else setMsg(r.error ?? "Could not send the code.");
            })}>{sentTo ? "Send a new code" : "Send me a code"}</button>
            {!view.channels.email.available && channel === "email" && <p className="text-sm text-destructive">{view.channels.email.reason}</p>}
            {sentTo && (
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await post(token, "otp-check", { code }); if (r.ok) { setVerified(true); setMsg(null); } else setMsg(r.error ?? "That code is not right."); }); }}>
                <label className="block text-sm font-medium" htmlFor="otp">6-digit code</label>
                <input id="otp" className={field} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                <button type="submit" className={primary} disabled={busy || code.length !== 6}>Confirm code</button>
              </form>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="s3" className="space-y-3">
        <h2 id="s3" className="text-base font-semibold">3. Sign</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="block text-sm font-medium" htmlFor="nm">Your full name</label><input id="nm" className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
          <div><label className="block text-sm font-medium" htmlFor="ds">Your role or designation (optional)</label><input id="ds" className={field} value={designation} onChange={(e) => setDesignation(e.target.value)} autoComplete="organization-title" /></div>
        </div>
        <div role="tablist" aria-label="How to sign" className="flex gap-2">
          {(["draw", "type", "upload"] as const).map((t) => (
            <button key={t} role="tab" type="button" aria-selected={tab === t} className={tab === t ? primary : secondary} onClick={() => setTab(t)}>{t === "draw" ? "Draw" : t === "type" ? "Type" : "Upload"}</button>
          ))}
        </div>
        {tab === "draw" && <DrawPad onChange={setDrawn} />}
        {tab === "type" && (
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="ty">Type your name</label>
            <input id="ty" className={field} value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={80} />
            <div className="flex gap-2">{view.typedStyles.map((s) => <button key={s.key} type="button" aria-pressed={style === s.key} className={style === s.key ? primary : secondary} onClick={() => setStyle(s.key)}>{s.label}</button>)}</div>
            <p className="min-h-16 rounded-lg border bg-white p-3 text-3xl text-black" style={{ fontFamily: view.typedStyles.find((s) => s.key === style)?.css }} aria-label="Preview of your typed signature">{typed}</p>
          </div>
        )}
        {tab === "upload" && (
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="up">Upload a picture of your signature (PNG or JPG, under 1.5 MB)</label>
            <input id="up" type="file" accept="image/png,image/jpeg" className={field} onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) { setUploaded(null); return; }
              if (f.size > 1_500_000) { setMsg("Use a signature image under 1.5 MB."); setUploaded(null); return; }
              const r = new FileReader();
              r.onload = () => setUploaded(String(r.result).split(",")[1] ?? null);
              r.readAsDataURL(f);
            }} />
          </div>
        )}

        <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Before you sign</p>
          <p>{view.consent.notice}</p>
          <p className="text-muted-foreground">{view.consent.howItWorks}</p>
          <p className="text-xs text-muted-foreground">{view.consent.reviewMarker} (version {view.consent.version})</p>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>{view.consent.text}</span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={busy || !canSign} onClick={() => run(async () => {
            const r = await post(token, "sign", { signedName: name, designation, consentAccepted: agree, consentVersion: view.consent.version, signature });
            if (r.ok) setDone("signed"); else setMsg(r.error ?? "Could not sign.");
          })}>Sign the document</button>
          <button type="button" className={secondary} onClick={() => setDeclining(true)}>I do not want to sign</button>
        </div>
        {!canSign && <p className="text-xs text-muted-foreground">{!viewed ? "Open the document first. " : ""}{!verified ? "Confirm the code. " : ""}{!view.canSignNow ? "Wait for your turn. " : ""}{!agree ? "Tick the box to agree. " : ""}{!signature ? "Add your signature." : ""}</p>}

        {declining && (
          <form className="space-y-2 rounded-lg border p-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await post(token, "decline", { reason }); if (r.ok) setDone("declined"); else setMsg(r.error ?? "Could not record your answer."); }); }}>
            <label className="block text-sm font-medium" htmlFor="rs">Why are you declining?</label>
            <textarea id="rs" className={`${field} h-24 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            <div className="flex gap-2"><button type="submit" className={primary} disabled={busy || reason.trim().length < 3 || !verified}>Decline</button><button type="button" className={secondary} onClick={() => setDeclining(false)}>Cancel</button></div>
            {!verified && <p className="text-xs text-muted-foreground">Confirm the code in step 2 first.</p>}
          </form>
        )}
      </section>

      <p role="alert" aria-live="assertive" className={msg ? "rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm" : "sr-only"}>{msg}</p>
    </div>
  );
}
