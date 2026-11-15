"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Copy, Loader2, MailCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OrgMultiPicker from "@/components/platform/OrgMultiPicker";
import AccessMatrix from "@/components/products/commandos/people/AccessMatrix";
import PersonPreview from "@/components/products/commandos/people/PersonPreview";
import { validateDetails, USER_TYPES, type PersonDetails, type PersonDraft } from "@/lib/products/commandos/people-rules";
import type { PersonValidation, SaveResult } from "@/lib/products/commandos/people";
import type { OrgOption } from "@/lib/platform/organization/rules";
import type { AccessMap } from "@/lib/access/types";
import type { AccessUiModel } from "@/lib/access/ui-model";

export interface WizardActions {
  check: (draft: Partial<PersonDraft>, personId?: string) => Promise<PersonValidation>;
  create: (draft: Partial<PersonDraft>) => Promise<SaveResult>;
  update: (id: string, draft: Partial<PersonDraft>) => Promise<SaveResult>;
}

const STEPS = ["Person details", "Access", "Preview"] as const;

/** Split what the server prefilled into picked features and carried identity gates (keys the screen does not show). */
function splitCarried(model: AccessUiModel, map: AccessMap): { picked: AccessMap; carried: AccessMap } {
  const shown = new Set(model.products.flatMap((p) => p.features.map((f) => f.key)));
  const picked: AccessMap = {};
  const carried: AccessMap = {};
  for (const [p, m] of Object.entries(map)) for (const [k, v] of Object.entries(m)) ((shown.has(k) ? picked : carried)[p] ??= {})[k] = v;
  return { picked, carried };
}

const USER_TYPE_LABEL: Record<string, string> = { employee: "Employee", contractor: "Contractor or freelancer", partner: "External partner", system: "System account" };

export default function PersonWizard({
  mode,
  personId,
  initial,
  model,
  org,
  actions,
  listHref = "/commandos/users",
  seatLine,
  startStep = 1,
}: {
  mode: "create" | "edit";
  personId?: string;
  initial: { details: PersonDetails; picked: AccessMap; isDirector: boolean; fromLegacyRoles?: boolean };
  model: AccessUiModel;
  org: { departments: OrgOption[]; teams: OrgOption[]; designations: OrgOption[] };
  actions: WizardActions;
  listHref?: string;
  seatLine?: string;
  /** Opens on a later step (used by the development harness and tests). */
  startStep?: 1 | 2 | 3;
}) {
  const router = useRouter();
  const start = useMemo(() => splitCarried(model, initial.picked), [model, initial.picked]);
  const [step, setStep] = useState<1 | 2 | 3>(startStep);
  const [details, setDetails] = useState<PersonDetails>(initial.details);
  const [picked, setPicked] = useState<AccessMap>(start.picked);
  const carried = start.carried;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<PersonValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, startSaving] = useTransition();
  const [done, setDone] = useState<SaveResult | null>(null);
  const topRef = useRef<HTMLHeadingElement>(null);
  const isDirector = initial.isDirector;

  const draft = useCallback((): Partial<PersonDraft> => ({ ...details, access: mergeMaps(picked, carried) }), [details, picked, carried]);

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      setValidation(await actions.check(draft(), personId));
    } catch {
      toast.error("Could not check this just now. Try again.");
    } finally {
      setChecking(false);
    }
  }, [actions, draft, personId]);

  // Step 3 always shows a fresh check.
  useEffect(() => {
    if (step === 3) void runCheck();
    topRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const go = (next: 1 | 2 | 3) => {
    if (next > step && step === 1) {
      const e = validateDetails(details, { isDirector });
      if (mode === "edit") delete e.email;
      setErrors(e);
      if (Object.keys(e).length) return;
    }
    if (next === 3 && !isDirector && !Object.keys(picked).some((p) => p !== model.workspaceProduct)) {
      toast.error("Give access to at least one product first.");
      setStep(2);
      return;
    }
    setStep(next);
  };

  const save = () => {
    startSaving(async () => {
      const res = mode === "edit" && personId ? await actions.update(personId, draft()) : await actions.create(draft());
      if (!res.ok) {
        if (res.errors) { setErrors(res.errors); setStep(1); }
        toast.error(res.error ?? "Could not save.");
        return;
      }
      setDone(res);
      if (mode === "edit") { toast.success("Saved."); router.push(listHref); router.refresh(); }
    });
  };

  const set = <K extends keyof PersonDetails>(k: K, v: PersonDetails[K]) => setDetails((d) => ({ ...d, [k]: v }));

  if (done && mode === "create") return <CreatedScreen result={done} email={details.email} name={details.name} listHref={listHref} />;

  return (
    <div className="min-w-0 space-y-4">
      <ol className="flex max-w-full items-center gap-2 overflow-x-auto pb-1" aria-label="Steps">
        {STEPS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const active = step === n, past = step > n;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => n < step && go(n)}
                aria-current={active ? "step" : undefined}
                disabled={n > step}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${active ? "border-primary bg-primary/10 font-semibold text-primary" : past ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground"}`}
              >
                <span className={`flex size-5 items-center justify-center rounded-full text-xs ${active ? "bg-primary text-primary-foreground" : past ? "bg-emerald-500 text-white" : "bg-muted"}`}>{past ? <Check className="size-3" aria-hidden /> : n}</span>
                {label}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-6 bg-border" aria-hidden />}
            </li>
          );
        })}
      </ol>

      <div className="rounded-2xl border border-border/50 bg-card p-4 sm:p-6">
        <h2 ref={topRef} tabIndex={-1} className="mb-4 text-lg font-bold outline-none">
          {step === 1 ? "Person details" : step === 2 ? "Access" : "Preview"}
          <span className="ml-2 text-xs font-normal text-muted-foreground">Step {step} of 3</span>
        </h2>

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.name} required>
              <Input value={details.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" aria-invalid={Boolean(errors.name)} />
            </Field>
            <Field label="Work email" error={errors.email} required>
              <Input type="email" value={details.email} onChange={(e) => set("email", e.target.value)} disabled={mode === "edit"} autoComplete="off" aria-invalid={Boolean(errors.email)} />
            </Field>
            <Field label="Phone" error={errors.phone} hint="Optional">
              <Input value={details.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="off" inputMode="tel" />
            </Field>
            <Field label="Joining date" error={errors.joiningDate} hint="Optional">
              <Input type="date" value={details.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} />
            </Field>
            <Field label="User type">
              <select value={details.userType} onChange={(e) => set("userType", e.target.value as PersonDetails["userType"])} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm">
                {USER_TYPES.map((t) => <option key={t} value={t}>{USER_TYPE_LABEL[t]}</option>)}
              </select>
            </Field>
            {mode === "create" && (
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">How do they get in?</legend>
                {([["password", "Temporary password", "You get a password to hand over. They must change it at first sign-in."], ["email", "Email invitation", "They get a link by email and choose their own password."]] as const).map(([v, t, d]) => (
                  <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-sm ${details.invite === v ? "border-primary bg-primary/5" : "border-border/60"}`}>
                    <input type="radio" name="invite" value={v} checked={details.invite === v} onChange={() => set("invite", v)} className="mt-0.5 accent-primary" />
                    <span><span className="font-medium">{t}</span><span className="block text-xs text-muted-foreground">{d}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
            <div className="sm:col-span-2 grid gap-4 md:grid-cols-3">
              <div>
                <OrgMultiPicker kind="department" label="Departments" options={org.departments} value={details.departmentIds} onChange={(v) => set("departmentIds", v)} emptyText="No departments yet. Add them in Organization settings." />
                {errors.departmentIds && <p className="mt-1 text-xs text-destructive">{errors.departmentIds}</p>}
              </div>
              <div>
                <OrgMultiPicker kind="team" label="Teams" options={org.teams} value={details.teamIds} departmentIds={details.departmentIds} onChange={(v) => set("teamIds", v)} emptyText="No teams for these departments." />
                {errors.teamIds && <p className="mt-1 text-xs text-destructive">{errors.teamIds}</p>}
              </div>
              <div>
                <OrgMultiPicker kind="designation" label="Designations (first = main title)" options={org.designations} value={details.designationIds} departmentIds={details.departmentIds} primaryFirst onChange={(v) => set("designationIds", v)} emptyText="No designations for these departments." />
                {errors.designationIds && <p className="mt-1 text-xs text-destructive">{errors.designationIds}</p>}
                {isDirector && <p className="mt-1 text-xs text-muted-foreground">This person is a Director.</p>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Departments, teams and designations are managed once in <Link className="underline" href="/commandos/settings/organization/departments">Organization settings</Link> and shared by every product.
              {seatLine ? ` ${seatLine}` : ""}
            </p>
          </div>
        )}

        {step === 2 && (
          <>
            {initial.fromLegacyRoles && mode === "edit" && !isDirector && (
              <p className="mb-3 rounded-xl border border-border/50 bg-muted/40 p-3 text-xs text-muted-foreground">
                This person&apos;s access was set up before this screen existed. It is shown below exactly as it works today.
              </p>
            )}
            <AccessMatrix model={model} picked={picked} carried={carried} onChange={setPicked} isDirector={isDirector} defaultOpen={Object.keys(picked).slice(0, 1)} />
          </>
        )}

        {step === 3 && (
          <PersonPreview details={details} validation={validation} loading={checking} org={org} isDirector={isDirector} mode={mode} onEdit={(s) => setStep(s)} fromLegacyRoles={initial.fromLegacyRoles} />
        )}
      </div>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-background/95 px-1 py-3 backdrop-blur">
        <Link href={listHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>Cancel</Link>
        <div className="flex gap-2">
          {step > 1 && <Button type="button" variant="outline" onClick={() => go((step - 1) as 1 | 2)}><ArrowLeft className="size-4" data-icon="inline-start" />Back</Button>}
          {step < 3 && <Button type="button" onClick={() => go((step + 1) as 2 | 3)}>Next<ArrowRight className="size-4" data-icon="inline-end" /></Button>}
          {step === 3 && (
            <Button type="button" onClick={save} disabled={saving || checking || !validation?.ok}>
              {saving && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
              {mode === "edit" ? "Save changes" : "Create person"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function mergeMaps(a: AccessMap, b: AccessMap): AccessMap {
  const out: AccessMap = {};
  for (const m of [a, b]) for (const [p, f] of Object.entries(m)) out[p] = { ...(out[p] ?? {}), ...f };
  return out;
}

function Field({ label, error, hint, required, children }: { label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive"> *</span>}{hint && <span className="ml-1 font-normal text-muted-foreground">({hint})</span>}</Label>
      {children}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

function CreatedScreen({ result, email, name, listHref }: { result: SaveResult; email: string; name: string; listHref: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(result.tempPassword ?? ""); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { toast.error("Copy failed. Select the password and copy it."); } };
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-border/50 bg-card p-6 text-center" role="status">
      <MailCheck className="mx-auto mb-2 size-9 text-emerald-600" aria-hidden />
      <h2 className="text-lg font-bold">{name || email} has been added</h2>
      {result.invitedEmail ? (
        <p className="mt-1 text-sm text-muted-foreground">An invitation was emailed to {result.invitedEmail}. Their account is created when they accept it.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">Give {email} this temporary password. It is shown only now.</p>
          <div className="mx-auto mt-3 flex max-w-xs items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
            <code className="flex-1 text-base font-semibold tracking-wide select-all">{result.tempPassword}</code>
            <Button type="button" variant="outline" size="xs" onClick={copy}><Copy className="size-3.5" data-icon="inline-start" />{copied ? "Copied" : "Copy"}</Button>
          </div>
        </>
      )}
      {result.hrWarning && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{result.hrWarning}</p>}
      <div className="mt-4 flex justify-center gap-2">
        <Link href={listHref} className={buttonVariants({ variant: "default", size: "sm" })}>Back to people</Link>
        <Link href="/commandos/users/new" className={buttonVariants({ variant: "outline", size: "sm" })}>Add another person</Link>
      </div>
    </div>
  );
}
