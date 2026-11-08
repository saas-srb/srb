"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Building2, Check, Clock, CreditCard, Globe, LayoutGrid, Loader2, Network, Palette, Plus, Sparkles, Trash2, UserPlus, Users, X } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  COMPANY_SIZES,
  CURRENCIES,
  DEFAULT_MODULES,
  DEPARTMENT_TEMPLATES,
  INDUSTRIES,
  MODULES,
  ONBOARDING_STEPS,
  ROLE_PRESETS,
  type DepartmentTemplate,
  type Industry,
  type OnboardingStep,
} from "@/lib/platform/onboarding/catalog";
import type { ProfileInput } from "@/lib/platform/onboarding/state";
import type { StoredBranding } from "@/lib/platform/branding/types";
import BrandingThemeForm from "@/components/platform/BrandingThemeForm";
import type { PickerTheme } from "@/components/platform/ThemePicker";
import { applyStructureAction, finishTeamStepAction, inviteAction, revokeInviteAction, saveModulesAction, saveProfileAction, skipOnboardingAction, skipStepAction, type InviteRow } from "./actions";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

interface Props {
  companyName: string;
  completedSteps: OnboardingStep[];
  profile: ProfileInput;
  existingDepartments: { id: string; name: string }[];
  invitations: { id: string; email: string; name: string; preset: string }[];
  customRoles: { id: string; name: string }[];
  enabledModules: string[] | null;
  /** The products offered in step 4 — names and descriptions from the Product Registry, minus any the platform switched off. */
  panelChoices: { key: string; label: string; description: string; core: boolean }[];
  timezones: string[];
  branding: StoredBranding;
  themes: PickerTheme[];
  activeThemeKey: string;
  appliedThemeKey: string;
}

const STEP_META: Record<string, { icon: React.ComponentType<{ className?: string }>; hint: string; why: string }> = {
  profile: { icon: Building2, hint: "About your company", why: "Printed on invoices, payslips, letters and your website." },
  structure: { icon: Network, hint: "Departments", why: "Gives every person a place in the company and drives reporting lines." },
  team: { icon: UserPlus, hint: "Invite people", why: "Teammates get an email and see only the products their role allows." },
  branding: { icon: Palette, hint: "Logo & theme", why: "Your name and theme appear on your website and every product, email and PDF." },
  modules: { icon: LayoutGrid, hint: "Pick products", why: "Switch on what you use; the rest stays out of everyone's way." },
};

export default function OnboardingWizard(props: Props) {
  const firstOpen = ONBOARDING_STEPS.findIndex((s) => !props.completedSteps.includes(s.key));
  const [step, setStep] = useState(firstOpen === -1 ? ONBOARDING_STEPS.length : firstOpen);
  const [industry, setIndustry] = useState<Industry | "">((props.profile.industry as Industry) || "");
  const [skipping, startSkip] = useTransition();
  const total = ONBOARDING_STEPS.length;
  const done = step >= total;
  const next = () => setStep((s) => s + 1);
  const finished = ONBOARDING_STEPS.filter((s, i) => i < step || props.completedSteps.includes(s.key)).length;
  const percent = done ? 100 : Math.round((Math.min(finished, total) / total) * 100);
  const currentKey = ONBOARDING_STEPS[step]?.key;
  const meta = currentKey ? STEP_META[currentKey] : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />
      <div className="relative mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Set up {props.companyName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">A few quick steps to make it yours — everything can be changed later.</p>
          </div>
          {!done && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={skipping}
              onClick={() =>
                startSkip(async () => {
                  const res = await skipOnboardingAction().catch(() => null);
                  window.location.assign(res?.redirectTo ?? "/commandos");
                })
              }
            >
              Skip for now
            </Button>
          )}
        </div>

        <div className="mb-6 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-foreground">{done ? "Setup complete" : `Step ${step + 1} of ${total}`}</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              {done ? (
                <>
                  <Sparkles className="size-3" /> All set
                </>
              ) : (
                <>
                  <Clock className="size-3" /> About {Math.max(1, total - step)} min left
                </>
              )}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary" initial={false} animate={{ width: `${percent}%` }} transition={{ type: "spring", stiffness: 110, damping: 20 }} />
          </div>

          <ol className="mt-4 grid grid-cols-5 gap-1 sm:gap-2" aria-label="Setup steps">
            {ONBOARDING_STEPS.map((s, i) => {
              const Icon = STEP_META[s.key]?.icon ?? Building2;
              const complete = i < step || props.completedSteps.includes(s.key);
              const active = i === step;
              return (
                <li key={s.key} className="relative">
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={active ? "step" : undefined}
                    className="group flex w-full flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full border text-sm transition-all",
                        complete && "border-primary bg-primary text-primary-foreground",
                        active && !complete && "border-primary bg-primary/10 text-primary ring-4 ring-primary/15",
                        !active && !complete && "border-border bg-muted/60 text-muted-foreground",
                      )}
                    >
                      {complete ? <Check className="size-4" /> : <Icon className="size-4" />}
                    </span>
                    <span className={cn("text-[11px] leading-tight sm:text-xs", active ? "font-semibold text-foreground" : "text-muted-foreground", !active && "hidden sm:block")}>{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {meta && (
            <p className="mb-3 flex items-center gap-2 px-1 text-sm text-muted-foreground">
              <Sparkles className="size-4 shrink-0 text-primary" />
              <span>
                <span className="font-medium text-foreground">Why this matters:</span> {meta.why}
              </span>
            </p>
          )}
          {step === 0 && <ProfileStep initial={props.profile} timezones={props.timezones} onIndustry={setIndustry} onDone={next} />}
          {step === 1 && <StructureStep industry={industry || "software_services"} existing={props.existingDepartments} onDone={next} />}
          {step === 2 && <TeamStep departments={props.existingDepartments} invitations={props.invitations} customRoles={props.customRoles} onDone={next} />}
          {step === 3 && (
            <StepCard title="Branding & theme" description="Your logo, name and theme — applied to your website and every product.">
              <BrandingThemeForm initial={props.branding} companyName={props.companyName} themes={props.themes} activeKey={props.activeThemeKey} appliedKey={props.appliedThemeKey} submitLabel="Save & continue" onSaved={next} />
            </StepCard>
          )}
          {step === 4 && <ModulesStep industry={industry || "software_services"} enabled={props.enabledModules} choices={props.panelChoices} onDone={next} />}
          {done && <DoneStep />}
        </motion.div>

        {!done && (
          <div className="mt-4 flex items-center justify-between">
            {step > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            ) : (
              <span />
            )}
            {currentKey && currentKey !== "profile" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={skipping}
                onClick={() =>
                  startSkip(async () => {
                    await skipStepAction(currentKey);
                    next();
                  })
                }
              >
                {skipping ? <Loader2 className="size-4 animate-spin" /> : "Skip this step"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <GlassCard>
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight">{title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </GlassCard>
  );
}

function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: React.ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Step 1 ───────────────────────────────────────────────────────────────────

/** Also the form of Settings → Organization profile (`saveLabel` replaces "Save & continue"). */
export function ProfileStep({ initial, timezones, onIndustry, onDone, saveLabel }: { initial: ProfileInput; timezones: string[]; onIndustry: (i: Industry) => void; onDone: () => void; saveLabel?: string }) {
  const [v, setV] = useState<ProfileInput>({ ...initial, country: initial.country || "India", timezone: initial.timezone || "Asia/Kolkata" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: keyof ProfileInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  return (
    <StepCard title="Company profile" description="Used on invoices, payslips, letters and your website.">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await saveProfileAction(v);
            if (res.ok) {
              onIndustry(v.industry as Industry);
              onDone();
            } else setErrors(res.errors);
          });
        }}
      >
        <Field label="Company name" htmlFor="ob-name" error={errors.name}>
          <Input id="ob-name" value={v.name} onChange={set("name")} required />
        </Field>
        <Field label="Legal name (optional)" htmlFor="ob-legal">
          <Input id="ob-legal" value={v.legalName} onChange={set("legalName")} placeholder="As registered" />
        </Field>
        <Field label="What does your company do?" htmlFor="ob-industry" error={errors.industry}>
          <select id="ob-industry" className={selectClass} value={v.industry} onChange={set("industry")} required>
            <option value="">Choose…</option>
            {INDUSTRIES.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Team size" htmlFor="ob-size" error={errors.size}>
          <select id="ob-size" className={selectClass} value={v.size} onChange={set("size")} required>
            <option value="">Choose…</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Country" htmlFor="ob-country" error={errors.country}>
          <Input id="ob-country" value={v.country} onChange={set("country")} autoComplete="country-name" />
        </Field>
        <Field label="Currency" htmlFor="ob-currency" error={errors.currency}>
          <select id="ob-currency" className={selectClass} value={v.currency} onChange={set("currency")}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Time zone" htmlFor="ob-tz" error={errors.timezone}>
          <select id="ob-tz" className={selectClass} value={v.timezone} onChange={set("timezone")}>
            {timezones.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Website (optional)" htmlFor="ob-web" error={errors.website}>
          <Input id="ob-web" value={v.website} onChange={set("website")} placeholder="https://" inputMode="url" />
        </Field>
        <Field label="Contact email (optional)" htmlFor="ob-email" error={errors.email}>
          <Input id="ob-email" type="email" value={v.email} onChange={set("email")} />
        </Field>
        <Field label="Phone (optional)" htmlFor="ob-phone">
          <Input id="ob-phone" type="tel" value={v.phone} onChange={set("phone")} />
        </Field>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : saveLabel ? saveLabel : <>Save & continue <ArrowRight className="size-4" /></>}
          </Button>
        </div>
      </form>
    </StepCard>
  );
}

// ── Step 2 ───────────────────────────────────────────────────────────────────

interface DeptRow extends DepartmentTemplate {
  selected: boolean;
  designationsText: string;
}

function StructureStep({ industry, existing, onDone }: { industry: Industry; existing: { id: string; name: string }[]; onDone: () => void }) {
  const router = useRouter();
  const existingNames = useMemo(() => new Set(existing.map((d) => d.name.toLowerCase())), [existing]);
  const [rows, setRows] = useState<DeptRow[]>(() => DEPARTMENT_TEMPLATES[industry].map((d) => ({ ...d, selected: true, designationsText: d.designations.join(", ") })));
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<DeptRow>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <StepCard title="Departments & designations" description="A starting structure for your industry. Untick what you don't need, rename anything, add your own.">
      <div className="space-y-2">
        {rows.map((row, i) => {
          const exists = existingNames.has(row.name.trim().toLowerCase());
          return (
            <div key={i} className={cn("rounded-lg border p-3", !row.selected && "opacity-60")}>
              <div className="flex items-center gap-2">
                <input type="checkbox" aria-label={`Include ${row.name}`} checked={row.selected} onChange={(e) => update(i, { selected: e.target.checked })} className="size-4 accent-primary" />
                <Input value={row.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Department name" className="h-8 font-medium" />
                {exists && <span className="shrink-0 text-xs text-muted-foreground">already set up</span>}
              </div>
              <Input value={row.designationsText} onChange={(e) => update(i, { designationsText: e.target.value })} aria-label={`Designations in ${row.name}`} className="mt-2 h-8 text-xs" placeholder="Designations, comma separated" />
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((r) => [...r, { name: "", code: "", designations: [], selected: true, designationsText: "" }])}>
          <Plus className="size-4" /> Add department
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {rows.filter((r) => r.selected && r.name.trim()).length} of {rows.length} departments selected
        </span>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const chosen = rows
                .filter((r) => r.selected && r.name.trim())
                .map((r) => ({ name: r.name, code: r.code, designations: r.designationsText.split(",").map((s) => s.trim()).filter(Boolean) }));
              await applyStructureAction(chosen);
              router.refresh();
              onDone();
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <>Create & continue <ArrowRight className="size-4" /></>}
        </Button>
      </div>
    </StepCard>
  );
}

// ── Step 3 ───────────────────────────────────────────────────────────────────

function TeamStep({ departments, invitations, customRoles, onDone }: { departments: { id: string; name: string }[]; invitations: Props["invitations"]; customRoles: Props["customRoles"]; onDone: () => void }) {
  const router = useRouter();
  const blank = (): InviteRow => ({ email: "", name: "", preset: "developer", departmentId: "", customRoleId: "" });
  const [rows, setRows] = useState<InviteRow[]>([blank(), blank()]);
  const [result, setResult] = useState<{ sent: string[]; errors: string[] } | null>(null);
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<InviteRow>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <StepCard title="Invite your team" description="Each person gets an email to set their password. Their role decides which products they see — you can fine-tune it later in Users & Roles.">
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className={`grid gap-2 ${customRoles.length > 0 ? "sm:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]" : "sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"}`}>
            <Input type="email" placeholder="email@company.com" aria-label="Email" value={row.email} onChange={(e) => update(i, { email: e.target.value })} />
            <Input placeholder="Name (optional)" aria-label="Name" value={row.name} onChange={(e) => update(i, { name: e.target.value })} />
            <select className={selectClass} aria-label="Role" value={row.preset} onChange={(e) => update(i, { preset: e.target.value })}>
              {ROLE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {customRoles.length > 0 && (
              <select className={selectClass} aria-label="Custom role" value={row.customRoleId ?? ""} onChange={(e) => update(i, { customRoleId: e.target.value })}>
                <option value="">No custom role</option>
                {customRoles.map((r) => (
                  <option key={r.id} value={r.id}>+ {r.name}</option>
                ))}
              </select>
            )}
            <select className={selectClass} aria-label="Department" value={row.departmentId ?? ""} onChange={(e) => update(i, { departmentId: e.target.value })}>
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove row" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((r) => [...r, blank()])}>
          <Plus className="size-4" /> Add person
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-1 text-sm" aria-live="polite">
          {result.sent.length > 0 && <p className="text-emerald-600">Invited {result.sent.join(", ")}.</p>}
          {result.errors.map((e) => (
            <p key={e} className="text-destructive">
              {e}
            </p>
          ))}
        </div>
      )}

      {invitations.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold">Pending invitations</p>
          <ul className="divide-y rounded-lg border text-sm">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate">
                  {inv.email} <span className="text-muted-foreground">· {ROLE_PRESETS.find((p) => p.value === inv.preset)?.label}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Cancel invitation for ${inv.email}`}
                  onClick={() =>
                    start(async () => {
                      await revokeInviteAction(inv.id);
                      router.refresh();
                    })
                  }
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={pending || rows.every((r) => !r.email.trim())}
          onClick={() =>
            start(async () => {
              const res = await inviteAction(rows);
              setResult(res);
              if (res.sent.length) {
                setRows((r) => r.filter((row) => !res.sent.includes(row.email.trim().toLowerCase())));
                router.refresh();
              }
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Send invitations"}
        </Button>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await finishTeamStepAction();
              onDone();
            })
          }
        >
          Continue <ArrowRight className="size-4" />
        </Button>
      </div>
    </StepCard>
  );
}

// ── Step 4 ───────────────────────────────────────────────────────────────────

function ModulesStep({ industry, enabled, choices, onDone }: { industry: Industry; enabled: string[] | null; choices: { key: string; label: string; description: string; core: boolean }[]; onDone: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(enabled ?? DEFAULT_MODULES[industry]));
  const [pending, start] = useTransition();
  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const recommended = useMemo(() => new Set<string>(DEFAULT_MODULES[industry]), [industry]);
  const count = choices.filter((m) => m.core || selected.has(m.key)).length;

  return (
    <StepCard title="Choose your products" description="Turn on what your company uses. Everything else stays out of your team's way — switch products on or off any time.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="xs" onClick={() => setSelected(new Set<string>(DEFAULT_MODULES[industry]))}>
          <Sparkles className="size-3" /> Use recommended
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={() => setSelected(new Set<string>(choices.map((m) => m.key)))}>
          Select all
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{count} products on</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {choices.map((m) => {
          const on = m.core || selected.has(m.key);
          return (
            <label key={m.key} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors", on ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50", m.core && "cursor-default")}>
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={on} disabled={m.core} onChange={() => toggle(m.key)} />
              <span>
                <span className="block text-sm font-semibold">
                  {m.label} {m.core && <span className="text-xs font-normal text-muted-foreground">· always on</span>}
                  {!m.core && recommended.has(m.key) && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Recommended</span>}
                </span>
                <span className="block text-xs text-muted-foreground">{m.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await saveModulesAction([...selected]);
              onDone();
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <>Finish setup <Check className="size-4" /></>}
        </Button>
      </div>
    </StepCard>
  );
}

function DoneStep() {
  const nextSteps = [
    { href: "/commandos/users", icon: Users, title: "Add your team", text: "Create or invite people and set their roles." },
    { href: "/commandos/settings/domains", icon: Globe, title: "Use your own domain", text: "Optional: connect www.yourcompany.com." },
    { href: "/commandos/settings/billing", icon: CreditCard, title: "Plan & billing", text: "See your trial and pick a plan." },
  ];
  return (
    <GlassCard>
      <CardHeader className="items-center justify-items-center text-center">
        <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }} className="mx-auto mb-2 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/25">
          <Check className="size-8" strokeWidth={3} />
        </motion.div>
        <CardTitle className="text-2xl font-black tracking-tight">You&apos;re all set</CardTitle>
        <CardDescription className="max-w-md text-sm leading-relaxed">Your workspace is ready. Invited teammates will appear as they accept.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">What&apos;s next</p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {nextSteps.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="group flex h-full flex-col gap-1 rounded-xl border border-border/60 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5">
                <n.icon className="size-4 text-primary" />
                <span className="text-sm font-semibold">{n.title}</span>
                <span className="text-xs text-muted-foreground">{n.text}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end">
          <Button render={<Link href="/commandos" />} nativeButton={false} size="lg">
            Go to your workspace <ArrowRight className="size-4" />
          </Button>
        </div>
      </CardContent>
    </GlassCard>
  );
}
