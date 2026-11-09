"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import WizardFrame, { type FrameStep } from "@/components/products/viralpulse-ai/shared/WizardFrame";
import { Button } from "@/components/ui/button";
import { ITEM_SECTIONS, type GeneratedSection, type ItemDetails } from "@/lib/products/playbook-ai/item-sections";
import { ITEM_KIND_INFO, type ItemKind } from "@/lib/products/playbook-ai/items-types";
import { LEGAL_REVIEW_BANNER } from "@/lib/products/playbook-ai/catalogue/types";
import { generateSectionAction, saveWizardItemAction } from "@/app/(products)/playbook-ai/(protected)/items-actions";
import { FIELD } from "@/components/products/playbook-ai/items/shared";

const STEPS: FrameStep[] = [{ key: "details", n: 1, label: "Details" }, { key: "generate", n: 2, label: "AI draft" }, { key: "edit", n: 3, label: "Edit and preview" }];

type SectionState = { status: "idle" | "working" | "done" | "error"; data?: GeneratedSection; error?: string };

function plainText(v: unknown): string {
  if (typeof v === "string") return "";
  if (Array.isArray(v)) return v.map(plainText).join(" ");
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.type === "text" && typeof o.text === "string") return o.text;
    return Object.values(o).map((x) => (typeof x === "object" ? plainText(x) : "")).join(" ");
  }
  return "";
}

const PLACEHOLDER_NOTE = "Values the AI could not confirm from your details are shown as highlighted placeholders. Fill them in the editor.";

export default function ItemWizard({ kind, aiEnabled, brand }: { kind: ItemKind; aiEnabled: boolean; brand?: { company: string; style: string; hasLogo: boolean; canChange: boolean } }) {
  const router = useRouter();
  const info = ITEM_KIND_INFO[kind];
  const plan = ITEM_SECTIONS[kind];
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [d, setD] = useState<ItemDetails>({ title: "", department: "", designation: "", description: "", reviewPeriod: kind === "kpi" ? "Annual" : "" });
  const [sections, setSections] = useState<Record<string, SectionState>>({});
  const [running, setRunning] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const cancel = useRef(false);

  const set = (patch: Partial<ItemDetails>) => setD((x) => ({ ...x, ...patch }));
  const formRef = useRef<HTMLDivElement>(null);
  /** The real values in the fields (a browser form-filler can change them without a React event), merged into the state. */
  const readDom = (): ItemDetails => {
    const get = (n: string, fallback: string): string => { const el = formRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${n}"]`); return el ? el.value : fallback; };
    const next: ItemDetails = { ...d, title: get("item-title", d.title), department: get("item-department", d.department), designation: get("item-designation", d.designation), description: get("item-description", d.description) };
    setD(next);
    return next;
  };
  const titleOk = d.title.trim().length >= 3 && (kind !== "kpi" || d.designation.trim().length >= 2);
  const allDone = plan.every((s) => sections[s.key]?.status === "done");

  const detailsRef = useRef(d);
  useEffect(() => { detailsRef.current = d; });
  async function runOne(key: string): Promise<boolean> {
    setSections((s) => ({ ...s, [key]: { status: "working" } }));
    const r = await generateSectionAction({ kind, sectionKey: key, details: detailsRef.current });
    if (r.ok) { setSections((s) => ({ ...s, [key]: { status: "done", data: r.section } })); return true; }
    setSections((s) => ({ ...s, [key]: { status: "error", error: r.message } }));
    return false;
  }

  async function runAll(only?: string[]) {
    setRunning(true); setError(null); cancel.current = false;
    for (const s of plan) {
      if (cancel.current) break;
      if (only && !only.includes(s.key)) continue;
      const ok = await runOne(s.key);
      if (!ok && !only) break; // stop at the first failure so the person can retry it; later sections need the same service
    }
    setRunning(false);
  }

  function goGenerate() {
    setError(null);
    const dd = readDom();
    if (dd.title.trim().length < 3) return;
    detailsRef.current = dd;
    setStep(2); setReached((r) => Math.max(r, 2));
    const pending = plan.filter((s) => sections[s.key]?.status !== "done").map((s) => s.key);
    if (pending.length) void runAll(pending);
  }

  async function describe() {
    setDescribing(true); setError(null);
    const r = await generateSectionAction({ kind, sectionKey: "description", details: readDom() });
    setDescribing(false);
    if (!r.ok) { setError(r.message); return; }
    const text = plainText(r.section.blocks).replace(/\s+/g, " ").trim();
    if (text) set({ description: text });
  }

  function save(blank: boolean) {
    setError(null);
    const dd = step === 1 ? readDom() : d;
    start(async () => {
      const r = await saveWizardItemAction({ kind, details: dd, ai: !blank, sections: blank ? undefined : plan.map((s) => ({ title: sections[s.key]!.data!.title, blocks: sections[s.key]!.data!.blocks })) });
      if (!r.ok) { setError(r.message); return; }
      toast.success("Saved as a draft");
      router.push(`/playbook-ai/documents/${r.documentId}?wizard=1`);
    });
  }

  const busy = running || saving || describing;
  const legal = kind === "document";

  return (
    <WizardFrame
      steps={STEPS}
      step={step}
      reached={reached}
      busy={busy}
      onGoTo={(n) => { if (n < step) setStep(n); }}
      navLabel={`${info.create} steps`}
      title={step === 1 ? `${info.singular} details` : "AI draft"}
      subtitle={step === 1 ? "Tell us what this is for. The AI uses only what you write here and your company profile." : "Each section is written separately and checked against your details. Nothing is saved until you continue."}
      banner={legal && step === 2 ? <p role="note" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{LEGAL_REVIEW_BANNER}</p> : undefined}
      backDisabled={step === 1}
      onBack={() => { cancel.current = true; setStep((s) => Math.max(1, s - 1)); }}
      actions={
        step === 1 ? (
          <>
            <Button type="button" variant="outline" disabled={!titleOk || busy} onClick={() => save(true)}>Start with a blank draft</Button>
            <Button type="button" disabled={!titleOk || busy || !aiEnabled} title={aiEnabled ? undefined : "AI drafting is switched off for this workspace"} onClick={goGenerate}><Sparkles className="size-4" /> Generate with AI</Button>
          </>
        ) : (
          <>
            {running ? <Button type="button" variant="outline" onClick={() => { cancel.current = true; }}>Stop</Button> : null}
            <Button type="button" disabled={!allDone || busy} onClick={() => save(false)}>{saving ? "Saving…" : "Save draft and edit"}</Button>
          </>
        )
      }
    >
      {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
      {brand && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Letterhead:</span>
          <span className="font-medium">{brand.company}</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{brand.style} style</span>
          {!brand.hasLogo && <span className="text-xs text-muted-foreground">no logo yet</span>}
          {brand.canChange && <a href="/playbook-ai/brand" className="ml-auto text-xs font-medium text-primary underline-offset-2 hover:underline">Change</a>}
        </div>
      )}
      {step === 1 ? (
        <div ref={formRef} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">{kind === "kpi" ? "Sheet title" : "Title"}</span>
            <input className={FIELD} autoComplete="off" name="item-title" value={d.title} maxLength={200} placeholder={kind === "sop" ? "Visitor management" : kind === "kpi" ? "Sales Executive KPI sheet" : "Internal travel letter"} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Department</span>
            <input className={FIELD} autoComplete="off" name="item-department" value={d.department} maxLength={120} onChange={(e) => set({ department: e.target.value })} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">{kind === "kpi" ? "Role or designation" : "Designation (who it concerns)"}</span>
            <input className={FIELD} autoComplete="off" name="item-designation" value={d.designation} maxLength={120} onChange={(e) => set({ designation: e.target.value })} /></label>
          {kind === "kpi" && (
            <label className="space-y-1 text-sm"><span className="font-medium">Review period</span>
              <select className={FIELD} value={d.reviewPeriod} onChange={(e) => set({ reviewPeriod: e.target.value })}>{["Monthly", "Quarterly", "Half-yearly", "Annual"].map((x) => <option key={x}>{x}</option>)}</select></label>
          )}
          <div className="space-y-1 text-sm sm:col-span-2">
            <div className="flex items-center justify-between"><span className="font-medium">Description</span>
              <Button type="button" size="sm" variant="outline" disabled={!aiEnabled || describing || d.title.trim().length < 3} onClick={() => void describe()}>
                {describing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Write with AI</Button></div>
            <textarea className={`${FIELD} h-28 py-2`} autoComplete="off" name="item-description" value={d.description} maxLength={1500} placeholder="What it is for, who uses it, anything the AI must take into account." onChange={(e) => set({ description: e.target.value })} />
          </div>
          {!aiEnabled && <p className="text-xs text-muted-foreground sm:col-span-2">AI drafting is switched off for this workspace. You can still start with a blank draft.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="divide-y rounded-xl border">
            {plan.map((s) => {
              const st = sections[s.key] ?? { status: "idle" as const };
              return (
                <li key={s.key} className="flex items-start gap-3 p-3 text-sm">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                    {st.status === "working" ? <Loader2 className="size-4 animate-spin text-primary" /> : st.status === "done" ? <Check className="size-4 text-emerald-600" /> : st.status === "error" ? <AlertTriangle className="size-4 text-destructive" /> : <span className="size-2 rounded-full bg-muted-foreground/40" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {st.status === "idle" && "Waiting"}
                      {st.status === "working" && "Writing and checking"}
                      {st.status === "done" && (st.data && st.data.placeholders.length > 0 ? `Written. ${st.data.placeholders.length} value(s) left as placeholders.` : "Written and checked")}
                      {st.status === "error" && st.error}
                    </p>
                    {st.status === "done" && st.data && st.data.warnings.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{st.data.warnings[0]}</p>}
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={busy || st.status === "working"} onClick={() => void runOne(s.key)}><RefreshCw className="size-3.5" /> {st.status === "error" ? "Retry" : "Regenerate"}</Button>
                </li>
              );
            })}
          </ul>
          {allDone && <p className="text-xs text-muted-foreground">{PLACEHOLDER_NOTE} The next step is the editor with a live PDF preview.</p>}
        </div>
      )}
    </WizardFrame>
  );
}
