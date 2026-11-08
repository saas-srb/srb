"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { previewBriefingAction, type BriefingPreview } from "@/lib/products/agentos/calls/actions";

/**
 * "What the agent will know": the briefing the agent is given about this person, built on the server by the same code the dial uses. The person reads
 * the sections, unticks any they don't want the agent to have (for example the team's notes) and sees what was condensed or left out. The selection
 * is handed back to the dialog and sent with the call; the briefing is rebuilt from fresh data when the call is dialed.
 */
export default function CallBriefingPreview({ target, purpose, disabled, onSelection }: {
  target: { product: string; entityType: string; entityId: string; label: string };
  purpose: string;
  disabled?: boolean;
  onSelection: (keys: string[] | null) => void;
}) {
  const [preview, setPreview] = useState<BriefingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const seq = useRef(0);
  const builtWith = useRef<string | null>(null);

  // Load when the purpose or record changes, and again (shortly after) when a section is ticked or unticked.
  useEffect(() => {
    if (!purpose) return;
    if (selected !== null && JSON.stringify([...selected].sort()) === builtWith.current) return; // this selection is what is already shown
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      setLoading(true);
      previewBriefingAction({ target, purpose, selection: selected })
        .then((r) => {
          if (mine !== seq.current) return;
          if (!r.ok) {
            setError(r.error);
            setPreview(null);
            onSelection(null);
            return;
          }
          setError(null);
          setPreview(r.preview);
          builtWith.current = JSON.stringify(r.preview.sections.filter((s) => s.selected).map((s) => s.key).sort());
          if (selected === null) {
            const keys = r.preview.sections.filter((s) => s.selected).map((s) => s.key);
            setSelected(keys);
            onSelection(keys);
          }
        })
        .catch(() => mine === seq.current && (setError("Couldn't prepare the briefing preview."), setPreview(null), onSelection(null)))
        .finally(() => mine === seq.current && setLoading(false));
    }, selected === null ? 0 : 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose, target.product, target.entityType, target.entityId, selected]);

  const toggle = (key: string, on: boolean) => {
    const next = on ? [...(selected ?? []), key] : (selected ?? []).filter((k) => k !== key);
    setSelected(next);
    onSelection(next);
  };

  if (preview && !preview.available && !error) return null;
  return (
    <section className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-3" aria-label="What the agent will know">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><ShieldCheck className="size-4 text-primary" />What the agent will know</p>
        {loading && <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" aria-label="Preparing" />}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {!preview && !error && <p className="text-xs text-muted-foreground">Preparing what the team knows about {target.label || "this person"}…</p>}
      {preview && (
        <>
          <p className="text-[11px] text-muted-foreground">
            So the agent can talk like someone who knows the history. Untick anything it should not have. {preview.chars.toLocaleString()} of {preview.budget.toLocaleString()} characters used.
          </p>
          <ul className="space-y-1.5">
            {preview.sections.map((s) => (
              <li key={s.key} className="rounded-xl border border-border/50 bg-background/60">
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <input
                    id={`cb-${s.key}`} type="checkbox" className="size-3.5 accent-primary" checked={s.selected} disabled={disabled || (s.sourceCount === 0)}
                    onChange={(e) => toggle(s.key, e.target.checked)}
                  />
                  <label htmlFor={`cb-${s.key}`} className="min-w-0 flex-1 truncate text-xs font-medium">
                    {s.title}
                    {s.internal && <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">internal</span>}
                  </label>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{s.sourceCount}</span>
                  {s.text && (
                    <button type="button" className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-expanded={open[s.key] === true} aria-label={`${open[s.key] ? "Hide" : "Show"} ${s.title}`} onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}>
                      {open[s.key] ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    </button>
                  )}
                </div>
                {(s.condensed > 0 || s.omitted > 0) && s.selected && (
                  <p className="px-2.5 pb-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                    {s.condensed > 0 && `${s.condensed} older condensed into a summary. `}{s.omitted > 0 && `${s.omitted} older not included.`}
                  </p>
                )}
                {open[s.key] && s.text && <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-border/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">{s.text}</pre>}
              </li>
            ))}
          </ul>
          {preview.warnings.length > 0 && (
            <ul role="status" className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-900 dark:text-amber-200">
              {preview.warnings.map((w) => <li key={w} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{w}</li>)}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">{preview.notice} It is rebuilt from the latest records when the call is placed.</p>
        </>
      )}
    </section>
  );
}
