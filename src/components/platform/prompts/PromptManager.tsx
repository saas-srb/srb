"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, Lock, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PromptDef } from "@/lib/prompts/types";
import { estimateTokens, MAX_PROMPT_CHARS, renderPrompt, validatePromptText } from "@/lib/prompts/types";
import { checkCompanyPrompt, MAX_COMPANY_PROMPT_CHARS, withSecurity } from "@/lib/prompts/guard";

export interface HistoryRow {
  id: string;
  version: number;
  action: string;
  text: string;
  note: string;
  at: string;
  by: string;
}
export type Result = { ok: true; version?: number } | { ok: false; error: string };
/** What the manager needs from the server. The platform page and the company page each pass their own (platform-wide or company-scoped). */
export interface PromptApi {
  save: (key: string, text: string, note: string) => Promise<Result>;
  setEnabled: (key: string, enabled: boolean) => Promise<Result>;
  reset: (key: string) => Promise<Result>;
  restore: (key: string, versionId: string) => Promise<Result>;
  history: (key: string) => Promise<HistoryRow[]>;
  test: (key: string, text: string, sample: string) => Promise<{ ok: true; output: string; ms: number } | { ok: false; error: string }>;
  /** Platform only: let companies change this prompt, or not. */
  setCompanyAllowed?: (key: string, allowed: boolean) => Promise<Result>;
}
export interface PromptStatusView {
  state: "default" | "custom" | "off";
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  note: string;
  uses7d?: number;
  overrideText: string | null;
  invalid?: boolean;
}
/** Platform page only: for prompts companies may change, whether they currently may and how many use their own wording. */
export type CompanyUse = Record<string, { allowed: boolean; using: number }>;

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");
const KIND: Record<PromptDef["kind"], string> = { system: "Instructions", task: "Task", classifier: "Decision", fragment: "Shared block", image: "Image", "default-content": "Starting content" };

type State = "default" | "custom" | "off";
const isLocked = (scope: string, p: PromptDef) => scope === "company" && !p.companyEditable;
const stateOf = (s: PromptStatusView | undefined): State => s?.state ?? "default";
const STATE_LABEL: Record<State, string> = { default: "Built-in", custom: "Customised", off: "Custom (off)" };
const COMPANY_LABEL: Record<State, string> = { default: "Standard", custom: "Your own wording", off: "Yours (off)" };
const STATE_CLASS: Record<State, string> = { default: "bg-muted text-muted-foreground", custom: "bg-primary/10 text-primary", off: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };

/** Lines added to / removed from the built-in text, for a quick "what did I change". */
function diff(a: string, b: string): { added: number; removed: number } {
  const A = new Set(a.split("\n")), B = new Set(b.split("\n"));
  return { added: [...B].filter((l) => !A.has(l)).length, removed: [...A].filter((l) => !B.has(l)).length };
}

export default function PromptManager({ prompts, status, products, canEdit, api, scope, companyUse }: { prompts: PromptDef[]; status: Record<string, PromptStatusView>; products: Record<string, string>; canEdit: boolean; api: PromptApi; scope: "platform" | "company";  companyUse?: CompanyUse }) {
  const [q, setQ] = useState("");
  const [area, setArea] = useState("all");
  const [kind, setKind] = useState("all");
  const [mode, setMode] = useState<"all" | State | "locked">("all");
  const [open, setOpen] = useState<string | null>(null);
  const areas = useMemo(() => [...new Set(prompts.map((p) => p.area))], [prompts]);
  const shown = prompts.filter((p) => (area === "all" || p.area === area) && (kind === "all" || p.kind === kind) && (mode === "all" || (mode === "locked" ? isLocked(scope, p) : !isLocked(scope, p) && stateOf(status[p.key]) === mode)) && (!q.trim() || `${p.name} ${p.key} ${p.description} ${p.text}`.toLowerCase().includes(q.trim().toLowerCase())));
  const custom = prompts.filter((p) => stateOf(status[p.key]) === "custom").length;
  const uses = Object.values(status).reduce((n, s) => n + (s.uses7d ?? 0), 0);
  const current = prompts.find((p) => p.key === open) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Prompts", String(prompts.length)],
          ["Customised", String(custom)],
          ["Used in the last 7 days", uses.toLocaleString("en-IN")],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or wording" className="pl-9" />
        </div>
        <select className={selectClass} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Group">
          <option value="all">All groups</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
          <option value="all">All kinds</option>
          {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="Status">
          <option value="all">Any status</option>
          <option value="default">{scope === "company" ? "Standard" : "Built-in"}</option>
          <option value="custom">{scope === "company" ? "Your own wording" : "Customised"}</option>
          <option value="off">{scope === "company" ? "Yours (off)" : "Custom (off)"}</option>
          {scope === "company" && <option value="locked">Locked by SelfRun</option>}
        </select>
      </div>

      {areas.filter((a) => shown.some((p) => p.area === a)).map((a) => (
        <section key={a} className="overflow-hidden rounded-lg border bg-card">
          <h2 className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold">{a}</h2>
          <ul className="divide-y">
            {shown.filter((p) => p.area === a).map((p) => {
              const s = status[p.key];
              const st = stateOf(s);
              return (
                <li key={p.key}>
                  <button type="button" onClick={() => setOpen(p.key)} className="flex w-full flex-wrap items-start gap-3 px-4 py-3 text-left hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{KIND[p.kind]} · {p.product === "platform" ? "All products" : (products[p.product] ?? p.product)} · {p.vars.length ? p.vars.map((v) => `{${v.name}}`).join(" ") : "no variables"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                      {isLocked(scope, p) ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground"><Lock className="size-3" /> Locked</span> : <span className={`rounded-full px-2 py-0.5 font-medium ${STATE_CLASS[st]}`}>{(scope === "company" ? COMPANY_LABEL : STATE_LABEL)[st]}{s && s.version > 0 ? ` · v${s.version}` : ""}</span>}
                      {scope === "platform" ? <span className="text-muted-foreground">{(s?.uses7d ?? 0).toLocaleString("en-IN")} uses / 7d{p.companyEditable ? ` · ${companyUse?.[p.key]?.using ?? 0} companies' own` : ""}</span> : s?.invalid ? <span className="text-destructive">Needs attention</span> : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {shown.length === 0 && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">No prompt matches.</p>}

      {current && isLocked(scope, current) && <LockedInfo def={current} product={current.product === "platform" ? "All products" : (products[current.product] ?? current.product)} onClose={() => setOpen(null)} />}
      {current && !isLocked(scope, current) && <Editor key={current.key} api={api} scope={scope} companyUse={companyUse?.[current.key]} def={current} status={status[current.key]} canEdit={canEdit} product={current.product === "platform" ? "All products" : (products[current.product] ?? current.product)} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Editor({ def, status, canEdit, product, onClose, api, scope, companyUse }: { api: PromptApi; scope: "platform" | "company"; companyUse?: { allowed: boolean; using: number }; def: PromptDef; status: PromptStatusView | undefined; canEdit: boolean; product: string; onClose: () => void }) {
  const router = useRouter();
  const st = stateOf(status);
  const base = status?.overrideText ?? def.text;
  const [text, setText] = useState(base);
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"edit" | "preview" | "changes" | "test" | "history">("edit");
  const [sample, setSample] = useState("");
  const [test, setTest] = useState<{ ok: boolean; text: string; ms?: number } | null>(null);
  const [testing, setTesting] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState(companyUse?.allowed ?? true);
  const [, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const company = scope === "company";
  const problem = company ? checkCompanyPrompt(def, text, def.text) : validatePromptText(def, text);
  const limit = company ? MAX_COMPANY_PROMPT_CHARS : MAX_PROMPT_CHARS;
  const word = company ? "standard" : "built-in";
  const dirty = text.trim() !== base.trim();
  const example = Object.fromEntries(def.vars.map((v) => [v.name, v.example]));
  const d = diff(def.text, text);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => {
    setBusy(true);
    setMsg(null);
    start(async () => {
      const res = await fn().catch((x: unknown) => ({ ok: false as const, error: x instanceof Error ? x.message : "Could not save." }));
      setBusy(false);
      if (res.ok) {
        setMsg({ ok: true, text: done });
        setHistory(null);
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    });
  };
  const insert = (name: string) => {
    const el = area.current;
    const token = `{{${name}}}`;
    if (!el) return setText((t) => t + token);
    const a = el.selectionStart, b = el.selectionEnd;
    setText(text.slice(0, a) + token + text.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
  };
  const showHistory = () => {
    setTab("history");
    if (!history) void api.history(def.key).then(setHistory).catch(() => setHistory([]));
  };
  const runTest = () => {
    setTesting(true);
    setTest(null);
    void api.test(def.key, text, sample)
      .then((r) => setTest(r.ok ? { ok: true, text: r.output || "(empty reply)", ms: r.ms } : { ok: false, text: r.error }))
      .catch((x: unknown) => setTest({ ok: false, text: x instanceof Error ? x.message : "The test run failed." }))
      .finally(() => setTesting(false));
  };
  const tabBtn = (t: typeof tab, label: string, onClick?: () => void) => (
    <button type="button" onClick={onClick ?? (() => setTab(t))} className={`rounded-md px-3 py-1.5 text-sm ${tab === t ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}>{label}</button>
  );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>{def.name}</SheetTitle>
          <SheetDescription>{def.description}</SheetDescription>
          <p className="text-xs text-muted-foreground">{KIND[def.kind]} · {product} · <span className={`rounded-full px-2 py-0.5 ${STATE_CLASS[st]}`}>{(company ? COMPANY_LABEL : STATE_LABEL)[st]}{status && status.version > 0 ? ` v${status.version}` : ""}</span>{def.model ? ` · ${def.model}` : ""}</p>
        </SheetHeader>

        <div className="flex gap-1 border-b px-4 py-2">
          {tabBtn("edit", "Edit")}
          {tabBtn("preview", "Preview")}
          {tabBtn("changes", "Compare")}
          {def.kind !== "image" && tabBtn("test", "Test run")}
          {tabBtn("history", "History", showHistory)}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {!company && <p className="text-[11px] text-muted-foreground">Used by: {def.usedBy.join(", ")}</p>}
          {def.note && <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">{def.note}</p>}
          {def.pinned && (
            <details className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">Fixed rules added after this text (cannot be edited)</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans">{def.pinned}</pre>
            </details>
          )}

          {tab === "edit" && (
            <>
              {company && <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">Only your workspace uses your wording. SelfRun&apos;s fixed security rules are added before and after it on every request: the assistant works with your company&apos;s information only, never reveals its instructions and never shares secrets. Wording that tries to get around that, or that mentions other companies, secrets or the database, can&apos;t be saved.</p>}
              {!company && def.companyEditable && companyUse && api.setCompanyAllowed && (
                <label className="flex items-start gap-2 rounded-md border p-3 text-xs">
                  <input type="checkbox" className="mt-0.5" checked={allowed} disabled={!canEdit || busy} onChange={(e) => { const v = e.target.checked; setAllowed(v); run(() => api.setCompanyAllowed!(def.key, v), v ? "Companies may change this prompt." : "Companies can no longer change this prompt (their saved wording stops applying)."); }} />
                  <span><span className="font-medium">Companies may change this prompt for their own workspace.</span> {companyUse.using} {companyUse.using === 1 ? "company uses" : "companies use"} their own wording now. Their wording is always wrapped in fixed security rules.</span>
                </label>
              )}
              {def.vars.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium">Variables (filled in automatically each time)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {def.vars.map((v) => (
                      <button key={v.name} type="button" disabled={!canEdit} title={`${v.description} Example: ${v.example || "(empty)"}`} onClick={() => insert(v.name)} className="rounded-md border bg-card px-2 py-1 font-mono text-xs hover:bg-muted disabled:opacity-60">
                        {`{{${v.name}}}`}{v.required ? " *" : ""}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">* must stay in the text. Hover a variable to see what it holds.</p>
                </div>
              )}
              <textarea ref={area} value={text} onChange={(e) => setText(e.target.value)} readOnly={!canEdit} spellCheck={false} rows={22} className="w-full rounded-md border border-input bg-transparent p-3 font-mono text-xs leading-relaxed shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30" />
              <p className={`text-xs ${text.length > limit ? "text-destructive" : "text-muted-foreground"}`}>{text.length.toLocaleString("en-IN")} characters · about {estimateTokens(text).toLocaleString("en-IN")} tokens</p>
              {problem && dirty && <p className="text-xs text-destructive">{problem}</p>}
              {canEdit && <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="What did you change and why? (kept in the history)" />}
            </>
          )}

          {tab === "preview" && (
            <>
              <p className="text-xs text-muted-foreground">How the text reads with example values filled in. The real values come from the live request.</p>
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">{company ? withSecurity(renderPrompt(text, example, def.vars.map((v) => v.name))) : renderPrompt(text, example, def.vars.map((v) => v.name))}</pre>
              {company && <p className="text-xs text-muted-foreground">The fixed security rules above and below your wording are added automatically on every request. They can&apos;t be edited, shortened or switched off.</p>}
              {def.vars.length > 0 && (
                <dl className="space-y-1 text-xs">
                  {def.vars.map((v) => (
                    <div key={v.name}><dt className="inline font-mono">{`{{${v.name}}}`}</dt> <dd className="inline text-muted-foreground">— {v.description}</dd></div>
                  ))}
                </dl>
              )}
            </>
          )}

          {tab === "changes" && (
            <>
              <p className="text-xs text-muted-foreground">Your text against the {word} one: {d.added} line{d.added === 1 ? "" : "s"} new, {d.removed} line{d.removed === 1 ? "" : "s"} removed.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div><p className="mb-1 text-xs font-medium capitalize">{word}</p><pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">{def.text}</pre></div>
                <div><p className="mb-1 text-xs font-medium">Yours</p><pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border p-3 text-xs">{text}</pre></div>
              </div>
            </>
          )}

          {tab === "test" && (
            <>
              <p className="text-xs text-muted-foreground">Sends the text above (with example values filled in) to the platform&apos;s own OpenAI key, followed by the sample message below. Nothing is saved. Each run uses AI tokens.</p>
              <textarea value={sample} onChange={(e) => setSample(e.target.value)} rows={4} maxLength={2000} placeholder="A sample message, like something a person would type" className="w-full rounded-md border border-input bg-transparent p-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30" />
              <Button type="button" disabled={!canEdit || testing || (!!problem && dirty)} onClick={runTest}>{testing && <Loader2 className="size-4 animate-spin" />} Run test</Button>
              {test && <pre className={`whitespace-pre-wrap rounded-md border p-3 text-xs ${test.ok ? "bg-muted/30" : "border-destructive/50 text-destructive"}`}>{test.text}{test.ms ? `\n\n— ${test.ms} ms` : ""}</pre>}
            </>
          )}

          {tab === "history" && (
            history === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>
            : history.length === 0 ? <p className="text-sm text-muted-foreground">Nothing has been changed yet.</p>
            : <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h.id} className={`rounded-md border p-3 text-xs ${status && h.version === status.version ? "border-primary/50 bg-primary/5" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">v{h.version} · {h.action}{status && h.version === status.version ? " · current" : ""}</span>
                      <span className="text-muted-foreground">{when(h.at)} · {h.by}</span>
                    </div>
                    {h.note && <p className="mt-1 text-muted-foreground">{h.note}</p>}
                    <p className="mt-1 line-clamp-2 font-mono text-[11px] text-muted-foreground">{h.text}</p>
                    <div className="mt-2 flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => { setText(h.text); setTab("edit"); }}>Load into editor</Button>
                      {canEdit && (
                        <Button type="button" size="sm" variant="outline" disabled={busy || (!!status && h.version === status.version)} onClick={() => confirm(`Restore version ${h.version}? It becomes a new version; nothing is removed.`) && run(() => api.restore(def.key, h.id), `Version ${h.version} restored as a new version.`)}><History className="size-3.5" /> Restore this version</Button>
                      )}
                    </div>
                  </li>
                ))}
                <li className="rounded-md border border-dashed p-3 text-xs">
                  <span className="font-medium capitalize">{word} text</span>
                  <p className="mt-1 line-clamp-2 font-mono text-[11px] text-muted-foreground">{def.text}</p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => { setText(def.text); setTab("edit"); }}>Load into editor</Button>
                    {canEdit && <Button type="button" size="sm" variant="outline" disabled={busy || st === "default"} onClick={() => confirm(`Go back to the ${word} text? It becomes a new version; nothing is removed.`) && run(() => api.reset(def.key), `Back to the ${word} text.`)}><RotateCcw className="size-3.5" /> Restore built-in</Button>}
                  </div>
                </li>
              </ul>
          )}
        </div>

        <div className="space-y-2 border-t p-4">
          {msg && <p role="status" className={`text-xs ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</p>}
          {status && status.version > 0 && <p className="text-[11px] text-muted-foreground">Last changed {when(status.updatedAt)} by {status.updatedBy}{status.note ? ` — ${status.note}` : ""}</p>}
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={busy || !dirty || !!problem} onClick={() => run(() => api.save(def.key, text, note), "Saved. It is live now.")}>
                {busy && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
              {st !== "default" && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => api.setEnabled(def.key, st !== "custom"), st === "custom" ? `Switched off: the ${word} text is used.` : "Custom text switched on.")}>
                  {st === "custom" ? "Switch custom text off" : "Switch custom text on"}
                </Button>
              )}
              {st !== "default" && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => confirm(`Go back to the ${word} text? It becomes a new version; nothing is removed.`) && run(async () => { const r = await api.reset(def.key); if (r.ok) setText(def.text); return r; }, `Back to the ${word} text (a new version; the history is kept).`)}>
                  <RotateCcw className="size-4" /> Reset to {word}
                </Button>
              )}
              {dirty && <Button type="button" variant="ghost" onClick={() => setText(base)}>Discard edits</Button>}
            </div>
          ) : <p className="text-xs text-muted-foreground">You can read prompts but not change them.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** A prompt SelfRun keeps for itself: what it is for and what goes into it, never its text. */
function LockedInfo({ def, product, onClose }: { def: PromptDef; product: string; onClose: () => void }) {
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">{def.name} <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground"><Lock className="size-3" /> Locked</span></SheetTitle>
          <SheetDescription>{def.description}</SheetDescription>
          <p className="text-xs text-muted-foreground">{KIND[def.kind]} · {product} · {def.area}</p>
        </SheetHeader>
        <div className="space-y-3 overflow-y-auto p-4 text-sm">
          <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">SelfRun manages this prompt for every company. It decides what the assistant may talk about, how it answers in each language, what data it can reach or how a shared feature works, so it is the same for everyone and can&apos;t be changed in a workspace. It is always applied. Its text isn&apos;t shown here.</p>
          {def.vars.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium">What is filled into it</p>
              <dl className="space-y-1 text-xs">
                {def.vars.map((v) => <div key={v.name}><dt className="inline font-mono">{`{{${v.name}}}`}</dt> <dd className="inline text-muted-foreground">— {v.description}</dd></div>)}
              </dl>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
