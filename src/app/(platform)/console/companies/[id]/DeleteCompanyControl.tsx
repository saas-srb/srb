"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Database, FileText, Globe, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { deleteCompanyAction, startCompanyDeletionAction } from "./delete-actions";

const PHRASE = "DELETE PERMANENTLY";
type Step = 0 | 1 | 2 | 3;
interface Preview { token: string; domains: string[]; collections: { name: string; rows: number }[]; totalRows: number }

const STEPS = ["Warning", "Review", "Confirm name", "Final check"];

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [STEPS[0], STEPS[1], STEPS[2]];
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Deletion progress" data-stepper>
      {items.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", done && "border-destructive bg-destructive text-destructive-foreground", active && "border-destructive text-destructive", !done && !active && "text-muted-foreground")}>
              {done ? <Check className="size-3.5" /> : n}
            </span>
            <span className={cn("hidden truncate sm:inline", active ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < items.length - 1 && <span className={cn("h-px flex-1", done ? "bg-destructive" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}

function Hero({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <DialogHeader className="items-start p-0 pr-8">
      <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive"><ShieldAlert className="size-6" /></div>
      <DialogTitle className="text-lg">{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
  );
}

/** Permanent company deletion, behind three steps: warning → review what goes → type the name → type the phrase and tick the box. */
export default function DeleteCompanyControl({ companyId, companyName }: { companyId: string; companyName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [phrase, setPhrase] = useState("");
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    if (pending) return;
    setStep(0); setPreview(null); setName(""); setPhrase(""); setSure(false); setError(null);
  };

  const begin = () =>
    start(async () => {
      setError(null);
      const res = await startCompanyDeletionAction(companyId);
      if (!res.ok) return setError(res.error);
      setPreview(res);
      setStep(2);
    });

  const destroy = () =>
    start(async () => {
      setError(null);
      const res = await deleteCompanyAction({ companyId, token: preview!.token, typedName: name, phrase });
      if (!res.ok) return setError(res.error);
      setStep(0);
      router.push("/console/companies");
      router.refresh();
    });

  const nameOk = name.trim() === companyName.trim();
  const phraseOk = phrase.trim() === PHRASE;

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setStep(1)}>
        <Trash2 className="size-4" data-icon="inline-start" /> Delete company
      </Button>
      <Dialog open={step > 0} onOpenChange={(o) => !o && close()}>
        <DialogContent className="grid max-h-[92vh] max-w-xl gap-5 overflow-y-auto p-5 sm:p-6">
          {step > 0 && <Stepper step={step as 1 | 2 | 3} />}

          {step === 1 && (
            <>
              <Hero title={`Delete ${companyName}?`} description="This is permanent. There is no recycle bin and nothing can be restored from this product." />
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { icon: Database, t: "All data", d: "Users, leads, sales, website, billing, support" },
                  { icon: FileText, t: "All files", d: "Every uploaded document and image" },
                  { icon: Globe, t: "All domains", d: "Removed from Vercel too" },
                ].map(({ icon: Icon, t, d }) => (
                  <div key={t} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                    <Icon className="mb-1.5 size-4 text-destructive" />
                    <p className="text-sm font-medium">{t}</p>
                    <p className="text-xs text-muted-foreground">{d}</p>
                  </div>
                ))}
              </div>
              <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> The company&apos;s addresses stop working the moment this finishes. Consider suspending it instead if you may need it back.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter className="p-0 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={close} disabled={pending}>Cancel</Button>
                <Button variant="destructive" onClick={begin} disabled={pending}>{pending ? <><Loader2 className="size-4 animate-spin" /> Checking…</> : "I understand, continue"}</Button>
              </DialogFooter>
            </>
          )}

          {step === 2 && preview && (
            <>
              <Hero title="Review what will be erased" description={<>{preview.totalRows.toLocaleString()} records in {preview.collections.length} collections, plus files and domains.</>} />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border p-2"><p className="text-xl font-semibold tabular-nums">{preview.totalRows.toLocaleString()}</p><p className="text-xs text-muted-foreground">Records</p></div>
                <div className="rounded-lg border p-2"><p className="text-xl font-semibold tabular-nums">{preview.collections.length}</p><p className="text-xs text-muted-foreground">Collections</p></div>
                <div className="rounded-lg border p-2"><p className="text-xl font-semibold tabular-nums">{preview.domains.length}</p><p className="text-xs text-muted-foreground">Domains</p></div>
              </div>
              <div className="max-h-48 space-y-3 overflow-auto rounded-lg border bg-muted/30 p-3 text-sm">
                {preview.domains.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Domains (removed from Vercel)</p>
                    <div className="flex flex-wrap gap-1.5">{preview.domains.map((d) => <span key={d} className="rounded-md border bg-background px-2 py-0.5 text-xs">{d}</span>)}</div>
                  </div>
                )}
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Records by collection</p>
                  <ul className="grid gap-x-6 sm:grid-cols-2">
                    {preview.collections.map((c) => <li key={c.name} className="flex justify-between gap-2 text-xs"><span className="truncate text-muted-foreground">{c.name}</span><span className="tabular-nums">{c.rows.toLocaleString()}</span></li>)}
                  </ul>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="del-name" className="text-sm">Type <strong className="select-all rounded bg-muted px-1.5 py-0.5">{companyName}</strong> to continue</label>
                <Input id="del-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={companyName} autoComplete="off" aria-invalid={name.length > 0 && !nameOk} />
              </div>
              <DialogFooter className="p-0 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button variant="destructive" disabled={!nameOk} onClick={() => setStep(3)}>Continue</Button>
              </DialogFooter>
            </>
          )}

          {step === 3 && (
            <>
              <Hero title="Final confirmation" description={<>Last chance. This will erase <strong>{companyName}</strong> for good.</>} />
              <div className="space-y-1.5">
                <label htmlFor="del-phrase" className="text-sm">Type <strong className="select-all rounded bg-muted px-1.5 py-0.5 font-mono">{PHRASE}</strong></label>
                <Input id="del-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={PHRASE} autoComplete="off" className="font-mono" aria-invalid={phrase.length > 0 && !phraseOk} />
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-destructive" checked={sure} onChange={(e) => setSure(e.target.checked)} />
                <span>I understand all data, files and domains of {companyName} will be deleted and this can never be reversed.</span>
              </label>
              {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <DialogFooter className="p-0 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => { setStep(2); setError(null); }} disabled={pending}>Back</Button>
                <Button variant="destructive" disabled={pending || !sure || !phraseOk} onClick={destroy}>
                  {pending ? <><Loader2 className="size-4 animate-spin" /> Deleting everything…</> : <><Trash2 className="size-4" /> Delete forever</>}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
