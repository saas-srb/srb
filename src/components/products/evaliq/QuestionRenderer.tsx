"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicDefinition, QuestionResponse } from "@/lib/products/evaliq/question-types";
import type { QuestionMedia } from "@/lib/products/evaliq/questions";

/**
 * Renders any question type from its PUBLIC definition (never the answer
 * key) — as an input in the exam, or read-only on previews / results. The
 * type-specific UI switches on `view.kind`, mirroring the server registry.
 */

export function QuestionMediaView({ media }: { media: QuestionMedia | null | undefined }) {
  if (!media) return null;
  return (
    <figure className="space-y-1">
      {media.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element -- author-supplied https / uploaded media, sizes unknown
        <img src={media.url} alt={media.caption || "Question image"} className="max-h-80 max-w-full rounded-xl border border-border/50 object-contain" />
      )}
      {media.kind === "audio" && <audio src={media.url} controls className="w-full max-w-md" />}
      {media.kind === "video" && <video src={media.url} controls className="max-h-80 max-w-full rounded-xl border border-border/50" />}
      {media.caption && <figcaption className="text-xs text-muted-foreground">{media.caption}</figcaption>}
    </figure>
  );
}

export function PromptText({ prompt }: { prompt: string }) {
  return <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{prompt.replace(/\[\[(\d+)\]\]/g, "____ ($1)")}</p>;
}

export default function QuestionRenderer({
  prompt,
  media,
  view,
  response,
  onChange,
  readOnly = false,
  inputId = "q",
  outcomeStatus,
}: {
  prompt: string;
  media?: QuestionMedia | null;
  view: PublicDefinition;
  response: QuestionResponse | null | undefined;
  onChange?: (r: QuestionResponse | null) => void;
  readOnly?: boolean;
  inputId?: string;
  outcomeStatus?: string;
}) {
  const set = (r: QuestionResponse | null) => {
    if (!readOnly) onChange?.(r);
  };

  return (
    <div className="space-y-4">
      {view.kind === "fill_blank" ? <FillBlank prompt={prompt} view={view} response={response} set={set} readOnly={readOnly} /> : <PromptText prompt={prompt} />}
      <QuestionMediaView media={media} />

      {view.kind === "choice" && <Choice view={view} response={response} set={set} readOnly={readOnly} name={inputId} outcomeStatus={outcomeStatus} />}

      {view.kind === "text" && (
        <div className="space-y-1">
          {view.long ? (
            <textarea
              aria-label="Your answer"
              value={(response as { text?: string } | null)?.text ?? ""}
              onChange={(e) => set(e.target.value ? { text: e.target.value } : null)}
              readOnly={readOnly}
              rows={10}
              maxLength={view.maxLength ?? undefined}
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Write your answer…"
            />
          ) : (
            <input
              aria-label="Your answer"
              value={(response as { text?: string } | null)?.text ?? ""}
              onChange={(e) => set(e.target.value ? { text: e.target.value } : null)}
              readOnly={readOnly}
              maxLength={view.maxLength ?? 500}
              className="h-10 w-full max-w-xl rounded-xl border border-border/60 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Your answer"
            />
          )}
          {view.maxLength && <p className="text-[11px] text-muted-foreground">{`Max ${view.maxLength} characters`}</p>}
        </div>
      )}

      {view.kind === "code" && (
        <div className="space-y-3">
          {view.schema && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Schema</p>
              <pre className="max-h-60 overflow-auto rounded-xl border border-border/50 bg-muted/40 p-3 font-mono text-xs">{view.schema}</pre>
            </div>
          )}
          {!view.editable && view.code && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">{`Code (${view.language})`}</p>
              <pre className="max-h-80 overflow-auto rounded-xl border border-border/50 bg-muted/40 p-3 font-mono text-xs">{view.code}</pre>
            </div>
          )}
          {view.sampleTests.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Sample tests</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pr-3 font-medium">Input</th>
                    <th className="font-medium">Expected output</th>
                  </tr>
                </thead>
                <tbody>
                  {view.sampleTests.map((t, i) => (
                    <tr key={i} className="align-top">
                      <td className="pr-3"><pre className="font-mono">{t.input || "—"}</pre></td>
                      <td><pre className="font-mono">{t.expectedOutput || "—"}</pre></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {view.answerMode === "text" ? (
            <textarea
              aria-label="Output"
              value={(response as { text?: string } | null)?.text ?? ""}
              onChange={(e) => set(e.target.value ? { text: e.target.value } : null)}
              readOnly={readOnly}
              rows={4}
              spellCheck={false}
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Type the exact output…"
            />
          ) : (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">{`Your ${view.language === "sql" ? "query" : "code"} (${view.language})`}</p>
              <textarea
                aria-label="Your code"
                value={(response as { code?: string } | null)?.code ?? (readOnly ? "" : view.code)}
                onChange={(e) => set(e.target.value ? { code: e.target.value } : null)}
                onKeyDown={(e) => {
                  if (e.key === "Tab" && !readOnly) {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const s = el.selectionStart;
                    const next = `${el.value.slice(0, s)}  ${el.value.slice(el.selectionEnd)}`;
                    set({ code: next });
                    requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
                  }
                }}
                readOnly={readOnly}
                rows={14}
                spellCheck={false}
                className="w-full rounded-xl border border-border/60 bg-slate-950 px-3 py-2 font-mono text-[13px] text-slate-100 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          )}
        </div>
      )}

      {view.kind === "match" && (
        <div className="space-y-2">
          {view.left.map((l) => {
            const cur = (response as { pairs?: Record<string, string> } | null)?.pairs?.[l.id] ?? "";
            return (
              <div key={l.id} className="grid items-center gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm">{l.text}</div>
                <select
                  aria-label={`Match for ${l.text}`}
                  value={cur}
                  disabled={readOnly}
                  onChange={(e) => {
                    const pairs = { ...((response as { pairs?: Record<string, string> } | null)?.pairs ?? {}) };
                    if (e.target.value) pairs[l.id] = e.target.value;
                    else delete pairs[l.id];
                    set(Object.keys(pairs).length ? { pairs } : null);
                  }}
                  className="h-10 rounded-xl border border-border/60 bg-background px-3 text-sm"
                >
                  <option value="">Choose…</option>
                  {view.right.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.text}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {view.kind === "ordering" && <Ordering view={view} response={response} set={set} readOnly={readOnly} />}
    </div>
  );
}

function Choice({ view, response, set, readOnly, name, outcomeStatus }: { view: Extract<PublicDefinition, { kind: "choice" }>; response: QuestionResponse | null | undefined; set: (r: QuestionResponse | null) => void; readOnly: boolean; name: string; outcomeStatus?: string }) {
  const selected = (response as { selected?: string[] } | null)?.selected ?? [];
  return (
    <div className="space-y-2" role={view.multiple ? "group" : "radiogroup"}>
      {view.multiple && <p className="text-xs text-muted-foreground">Select all that apply.</p>}
      {view.options.map((o, i) => {
        const on = selected.includes(o.id);
        const choiceTone = !readOnly
          ? on ? "border-primary/60 bg-primary/5" : "border-border/60 hover:bg-muted/40"
          : on
            ? outcomeStatus === "correct"
              ? "border-emerald-500/80 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 font-medium"
              : outcomeStatus === "incorrect"
                ? "border-rose-500/80 bg-rose-500/10 text-rose-900 dark:text-rose-200 font-medium"
                : outcomeStatus === "partial"
                  ? "border-amber-500/80 bg-amber-500/10 text-amber-900 dark:text-amber-200 font-medium"
                  : "border-primary/60 bg-primary/5"
            : "border-border/60 opacity-85";

        return (
          <label
            key={o.id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
              choiceTone,
              readOnly && "cursor-default"
            )}
          >
            <input
              type={view.multiple ? "checkbox" : "radio"}
              name={name}
              className="mt-0.5 size-4 accent-[var(--primary)]"
              checked={on}
              disabled={readOnly}
              onChange={() => {
                if (view.multiple) {
                  const next = on ? selected.filter((x) => x !== o.id) : [...selected, o.id];
                  set(next.length ? { selected: next } : null);
                } else set({ selected: [o.id] });
              }}
            />
            <span className="mr-1 font-semibold text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap">{o.text}</span>
            {readOnly && on && (
              <span className="text-[11px] font-semibold tracking-wide uppercase">
                {outcomeStatus === "correct" ? "✓ Your Selection" : outcomeStatus === "incorrect" ? "✗ Your Selection" : "Your Selection"}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

function FillBlank({ prompt, view, response, set, readOnly }: { prompt: string; view: Extract<PublicDefinition, { kind: "fill_blank" }>; response: QuestionResponse | null | undefined; set: (r: QuestionResponse | null) => void; readOnly: boolean }) {
  const blanks = (response as { blanks?: Record<string, string> } | null)?.blanks ?? {};
  const parts = prompt.split(/(\[\[\d+\]\])/g);
  return (
    <p className="text-[15px] leading-loose whitespace-pre-wrap text-foreground">
      {parts.map((part, i) => {
        const m = part.match(/^\[\[(\d+)\]\]$/);
        if (!m || !view.blankIds.includes(m[1])) return <span key={i}>{part}</span>;
        const id = m[1];
        return (
          <input
            key={i}
            aria-label={`Blank ${id}`}
            value={blanks[id] ?? ""}
            readOnly={readOnly}
            onChange={(e) => {
              const next = { ...blanks };
              if (e.target.value) next[id] = e.target.value;
              else delete next[id];
              set(Object.keys(next).length ? { blanks: next } : null);
            }}
            className="mx-1 inline-block h-8 w-36 rounded-lg border border-border/70 bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            placeholder={`(${id})`}
          />
        );
      })}
    </p>
  );
}

function Ordering({ view, response, set, readOnly }: { view: Extract<PublicDefinition, { kind: "ordering" }>; response: QuestionResponse | null | undefined; set: (r: QuestionResponse | null) => void; readOnly: boolean }) {
  const order = (response as { order?: string[] } | null)?.order ?? view.items.map((x) => x.id);
  const byId = new Map(view.items.map((x) => [x.id, x.text]));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    set({ order: next });
  };
  return (
    <div className="space-y-2">
      {!readOnly && <p className="text-xs text-muted-foreground">Use the arrows to put the items in the correct order. {response ? "" : "(Not answered until you move an item.)"}</p>}
      <ol className="space-y-1.5">
        {order.map((id, i) => (
          <li key={id} className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm">
            <span className="w-5 font-semibold text-muted-foreground">{i + 1}.</span>
            <span className="min-w-0 flex-1">{byId.get(id)}</span>
            {!readOnly && (
              <span className="flex gap-1">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-md p-1 hover:bg-muted disabled:opacity-30">
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" aria-label="Move down" disabled={i === order.length - 1} onClick={() => move(i, 1)} className="rounded-md p-1 hover:bg-muted disabled:opacity-30">
                  <ArrowDown className="size-3.5" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
