"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Search, ShieldAlert } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { usePanels } from "@/components/platform/PanelsProvider";
import { ROLE_GROUPS } from "@/lib/products/commandos/role-catalog";
import { PERMISSION_GROUPS } from "@/lib/products/commandos/permission-catalog";
import { PERMISSION_MODULE_PANEL, type CustomRoleView } from "@/lib/products/commandos/custom-roles-shared";
import { computeEffectiveClient } from "./access-preview";
import { createAdminUserAction } from "./actions";

type UserType = "employee" | "contractor" | "partner" | "system";
const USER_TYPES: { value: UserType; label: string; hint: string }[] = [
  { value: "employee", label: "Employee", hint: "Full internal team member with standard product access" },
  { value: "contractor", label: "Contractor / Freelancer", hint: "External consultant or temporary project worker" },
  { value: "partner", label: "External partner", hint: "Third-party vendor, auditor or affiliate partner" },
  { value: "system", label: "System account", hint: "Automated API bot, webhook worker or background process" },
];
const STEPS = ["Person", "Designation", "Access", "Review"] as const;
type Rule = "default" | "allow" | "deny";

function Stepper({ step, reached, onGo }: { step: number; reached: number; onGo: (n: number) => void }) {
  return (
    <ol className="mt-4 flex items-center gap-2" aria-label="Steps">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <button type="button" onClick={() => i <= reached && onGo(i)} disabled={i > reached} className="flex min-w-0 items-center gap-2 disabled:cursor-default" aria-current={current ? "step" : undefined}>
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", current ? "bg-primary text-primary-foreground" : done ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("truncate text-xs font-medium", current ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="h-px min-w-3 flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function RuleToggle({ value, onChange }: { value: Rule; onChange: (v: Rule) => void }) {
  const items: { v: Rule; label: string }[] = [{ v: "default", label: "Default" }, { v: "allow", label: "Allow" }, { v: "deny", label: "Deny" }];
  return (
    <div role="radiogroup" className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5 text-[11px] font-medium">
      {items.map((it) => (
        <button
          key={it.v}
          type="button"
          role="radio"
          aria-checked={value === it.v}
          onClick={() => onChange(it.v)}
          className={cn("rounded-md px-2 py-1 transition-colors", value === it.v ? (it.v === "allow" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : it.v === "deny" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" : "bg-background shadow-sm") : "text-muted-foreground hover:text-foreground")}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default function CreateUserSheet({
  open,
  onOpenChange,
  onCreated,
  customRoles,
  isDirector,
  seatLimit,
}: {
  customRoles: CustomRoleView[];
  isDirector: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (email: string, tempPassword: string) => void;
  planName?: string | null;
  seatLimit: number | null;
}) {
  const panels = usePanels();
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [phone, setPhone] = useState("");
  const [userType, setUserType] = useState<UserType>("employee");
  const [notes, setNotes] = useState("");
  const [desIds, setDesIds] = useState<string[]>([]);
  const [desSearch, setDesSearch] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [rules, setRules] = useState<Record<string, Rule>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // The designations picked in step 2: the first is the person's main one (their title), the rest are held as well.
  const designationId = desIds[0] ?? "";
  const customIds = desIds.slice(1);
  const isDirectorPick = designationId === "director";
  const designation = customRoles.find((d) => d.id === designationId);
  const designationName = isDirectorPick ? "Director" : designation?.name ?? "";
  const nameOf = (id: string) => (id === "director" ? "Director" : customRoles.find((d) => d.id === id)?.name ?? "");
  const overrides = useMemo(() => Object.fromEntries(Object.entries(rules).filter(([, v]) => v !== "default").map(([k, v]) => [k, v === "allow"])), [rules]);

  // What the person will end up with: the designation's roles, plus whatever was added here.
  const preview = useMemo(
    () => computeEffectiveClient({ director: isDirectorPick, designation, extraRoles: roles, extraDesignations: customRoles.filter((d) => customIds.includes(d.id)) }),
    [isDirectorPick, designation, roles, customIds, customRoles],
  );
  const included = new Set(preview.fromDesignation);
  const name_ = (panel: string, fallback: string) => panels[panel]?.name ?? fallback;
  const panelName = (key: string) => panels[key]?.name ?? ROLE_GROUPS.find((g) => g.panel === key)?.module ?? key;

  const toggleRole = (v: string) => setRoles((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  const toggleDesignation = (id: string) =>
    setDesIds((p) => {
      if (id === "director") return p.includes("director") ? [] : ["director"]; // the Director already has everything: nothing else is combined with it
      const base = p.filter((x) => x !== "director");
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  const makeMain = (id: string) => setDesIds((p) => [id, ...p.filter((x) => x !== id)]);

  function reset() {
    setStep(0); setReached(0); setName(""); setEmail(""); setJoiningDate(""); setPhone(""); setUserType("employee"); setNotes("");
    setDesIds([]); setDesSearch(""); setRoles([]); setRules({}); setError(null);
  }

  function next() {
    setError(null);
    if (step === 0) {
      if (name.trim().length < 2) return setError("Enter the person's full name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid work email address.");
    }
    if (step === 1 && desIds.length === 0) return setError("Choose at least one designation to continue.");
    const n = Math.min(step + 1, STEPS.length - 1);
    setStep(n);
    setReached((r) => Math.max(r, n));
  }

  function submit() {
    setError(null);
    start(async () => {
      const r = await createAdminUserAction({ email, name, designationId, extraRoles: roles, extraCustomRoleIds: customIds, extraOverrides: overrides, userType, notes, hr: { joiningDate: joiningDate || null, phone: phone.trim() || null } });
      if (!r.ok || !r.tempPassword) return setError(r.error ?? "Could not add this person.");
      toast.success(r.hrWarning ? `Added. HR file not made: ${r.hrWarning}` : "Added, with an HR file in TalentOS.");
      onCreated(email.trim().toLowerCase(), r.tempPassword);
      reset();
      onOpenChange(false);
    });
  }

  const q = desSearch.trim().toLowerCase();
  const departments = useMemo(() => [...new Set(customRoles.map((d) => d.department))].sort((a, b) => (a === "Custom" ? 1 : b === "Custom" ? -1 : a.localeCompare(b))), [customRoles]);
  const productsOfRoles = (rs: readonly string[]) => ROLE_GROUPS.filter((g) => g.roles.some((r) => rs.includes(r.value))).map((g) => g.panel);
  // Only the real seat limit decides this (the plan may have been given more seats by SelfRun).
  const onePerson = seatLimit === 1;

  const openedPanels = isDirectorPick ? ROLE_GROUPS.map((g) => g.panel) : productsOfRoles(preview.roles);
  const ruleGroups = PERMISSION_GROUPS.filter((g) => openedPanels.includes(PERMISSION_MODULE_PANEL[g.module]));
  const ruleCount = Object.keys(overrides).length;

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle className="text-lg font-semibold">Add a person</SheetTitle>
          <SheetDescription className="text-xs">
            Step {step + 1} of {STEPS.length}: {["who they are", "their job", "what they can open", "check and add"][step]}.
          </SheetDescription>
          {onePerson && (
            <p className="mt-1 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Your plan is for one person. <Link href="/commandos/settings/billing" className="font-semibold underline underline-offset-2">Upgrade</Link> to add more.
            </p>
          )}
          <Stepper step={step} reached={reached} onGo={(n) => { setError(null); setStep(n); }} />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5">
          {/* 1 — Person */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="nu-name">Full name</Label>
                <Input id="nu-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" autoComplete="off" autoFocus className="h-10" />
                <p className="text-xs text-muted-foreground">Shown in the people list and on their HR file.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-email">Work email</Label>
                <Input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@company.com" autoComplete="off" className="h-10" />
                <p className="text-xs text-muted-foreground">This is what they sign in with. You get a temporary password to give them.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="nu-join">Joining date <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="nu-join" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nu-phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="nu-phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Type of person</Label>
                <Select value={userType} onValueChange={(v) => v && setUserType(v as UserType)}>
                  <SelectTrigger className="h-10 w-full"><SelectValue>{USER_TYPES.find((t) => t.value === userType)?.label}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {USER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="block text-sm">{t.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-notes">Note <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea id="nu-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none" placeholder="Anything worth remembering: team, manager, how they were hired" />
              </div>
            </div>
          )}

          {/* 2 — Designation */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">A designation is the person&apos;s job. It gives the right access in every product at once. Choose one, or more if they do more than one job. The first is their main designation, shown as their title.</p>
              {desIds.length > 0 && (
                <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Chosen</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {desIds.map((id, i) => (
                      <li key={id} className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-background py-1 pl-2.5 pr-1 text-xs font-medium">
                        {nameOf(id)}
                        {i === 0 ? (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Main</span>
                        ) : (
                          <button type="button" onClick={() => makeMain(id)} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">Make main</button>
                        )}
                        <button type="button" onClick={() => toggleDesignation(id)} aria-label={`Remove ${nameOf(id)}`} className="rounded-full px-1.5 text-muted-foreground hover:text-destructive">×</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input value={desSearch} onChange={(e) => setDesSearch(e.target.value)} placeholder="Search designations" className="h-10 pl-8" aria-label="Search designations" />
              </div>
              <div className="space-y-5">
                {isDirector && (!q || "director".includes(q)) && (
                  <fieldset className="space-y-2">
                    <legend className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Leadership</legend>
                    <DesignationCard selected={desIds.includes("director")} main={designationId === "director"} onSelect={() => toggleDesignation("director")} title="Director" text="Full access to every product and company settings. Can change anyone's status and make other Directors." products={["Everything"]} tone="amber" />
                  </fieldset>
                )}
                {departments.map((dep) => {
                  const list = customRoles.filter((d) => d.department === dep && (!q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
                  if (list.length === 0) return null;
                  return (
                    <fieldset key={dep} className="space-y-2">
                      <legend className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{dep === "Custom" ? "Your own designations" : dep}</legend>
                      {list.map((d) => (
                        <DesignationCard key={d.id} selected={desIds.includes(d.id)} main={designationId === d.id && desIds.length > 1} onSelect={() => toggleDesignation(d.id)} title={d.name} text={d.description || "Access follows this designation."} products={productsOfRoles(d.baseRoles).map(panelName)} />
                      ))}
                    </fieldset>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3 — Access */}
          {step === 2 && (
            <div className="space-y-6">
              <section className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
                <p className="text-sm font-semibold">{designationName} gets</p>
                {isDirectorPick ? (
                  <p className="mt-1 text-sm text-muted-foreground">Full access to every product and every setting. There is nothing to add.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {productsOfRoles(preview.fromDesignation).map((p) => (
                      <li key={p}>
                        <p className="text-xs font-semibold">{panelName(p)}</p>
                        <ul className="mt-1 space-y-1">
                          {ROLE_GROUPS.find((g) => g.panel === p)!.roles.filter((r) => included.has(r.value)).map((r) => (
                            <li key={r.value} className="flex items-start gap-2 text-xs">
                              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                              <span><span className="font-medium">{r.label}</span> <span className="text-muted-foreground">{r.description}</span></span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {!isDirectorPick && (
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Add product roles <span className="font-normal text-muted-foreground">(optional)</span></h3>
                    <p className="text-xs text-muted-foreground">Only for something special, like a person who also approves purchases.</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Product roles</p>
                    {ROLE_GROUPS.map((g) => {
                      const extra = g.roles.filter((r) => !included.has(r.value));
                      if (extra.length === 0) return null;
                      const picked = extra.filter((r) => roles.includes(r.value)).length;
                      return (
                        <div key={g.panel} className="rounded-xl border border-border/70">
                          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                            <span className="text-sm font-medium">{panelName(g.panel)}</span>
                            {picked > 0 && <Badge variant="outline" className="border-primary/30 px-1.5 py-0 text-[10px] text-primary">{picked} added</Badge>}
                          </div>
                          <div className="space-y-1.5 p-2.5">
                            {extra.map((r) => (
                              <label key={r.value} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5", roles.includes(r.value) ? "border-primary/40 bg-primary/5" : "border-border/50 hover:bg-muted/30")}>
                                <Checkbox checked={roles.includes(r.value)} onCheckedChange={() => toggleRole(r.value)} className="mt-0.5" />
                                <span className="min-w-0">
                                  <span className="block text-xs font-medium">{r.label}</span>
                                  <span className="block text-[11px] leading-snug text-muted-foreground">{r.description}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {!isDirectorPick && isDirector && ruleGroups.length > 0 && (
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Fine-tune single permissions <span className="font-normal text-muted-foreground">(optional)</span></h3>
                    <p className="text-xs text-muted-foreground">For the products this person opens. <b>Default</b> follows the roles; <b>Allow</b> or <b>Deny</b> overrides one thing for this person only.</p>
                  </div>
                  {ruleGroups.map((g) => {
                    const set = g.permissions.filter((p) => (rules[p.key] ?? "default") !== "default").length;
                    return (
                      <div key={g.module} className="rounded-xl border border-border/70">
                        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                          <span className="text-sm font-medium">{name_(PERMISSION_MODULE_PANEL[g.module], g.module)}</span>
                          {set > 0 && <Badge variant="outline" className="border-primary/30 px-1.5 py-0 text-[10px] text-primary">{set} changed</Badge>}
                        </div>
                        <ul className="divide-y divide-border/50">
                          {g.permissions.map((p) => (
                            <li key={p.key} className="flex items-center justify-between gap-3 px-3 py-2">
                              <span className="min-w-0">
                                <span className="block text-xs font-medium">{p.label}</span>
                                <span className="block text-[11px] leading-snug text-muted-foreground">{p.description}</span>
                              </span>
                              <RuleToggle value={rules[p.key] ?? "default"} onChange={(v) => setRules((r) => ({ ...r, [p.key]: v }))} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </section>
              )}
            </div>
          )}

          {/* 4 — Review */}
          {step === 3 && (
            <div className="space-y-4">
              <dl className="divide-y divide-border/60 rounded-xl border">
                {[
                  ["Name", name.trim()],
                  ["Work email", email.trim().toLowerCase()],
                  ["Type", USER_TYPES.find((t) => t.value === userType)?.label ?? ""],
                  ...(joiningDate ? [["Joining date", joiningDate]] : []),
                  ...(phone.trim() ? [["Phone", phone.trim()]] : []),
                  [desIds.length > 1 ? "Main designation" : "Designation", designationName],
                  ...(desIds.length > 1 ? [["Also", desIds.slice(1).map(nameOf).join(", ")]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5 text-sm">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="rounded-xl border p-3.5">
                <p className="text-sm font-semibold">Can open</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {isDirectorPick ? <Badge variant="secondary">Every product</Badge> : openedPanels.map((p) => <Badge key={p} variant="secondary" className="font-normal">{panelName(p)}</Badge>)}
                </div>
                {!isDirectorPick && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {preview.roles.length} product role{preview.roles.length === 1 ? "" : "s"}
                    {roles.length > 0 ? `, including ${roles.length} added by hand` : ""}
                    {ruleCount > 0 ? `; ${ruleCount} single permission rule${ruleCount === 1 ? "" : "s"}` : ""}.
                  </p>
                )}
              </div>

              {isDirectorPick && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  A Director can see and change everything, including other people&apos;s status and designations. Add only someone you trust fully.
                </p>
              )}
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• A temporary password is shown once after you add them; they must change it at first sign-in.</li>
                <li>• An HR file is made for them in TalentOS. They complete the rest of their profile there.</li>
              </ul>
            </div>
          )}

          {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-border p-4">
          <Button type="button" variant="ghost" onClick={() => (step === 0 ? onOpenChange(false) : (setError(null), setStep(step - 1)))} disabled={pending}>
            {step === 0 ? "Cancel" : <><ArrowLeft className="size-4" data-icon="inline-start" /> Back</>}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              {step === 2 ? "Review" : "Next"} <ArrowRight className="size-4" data-icon="inline-end" />
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Add person"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DesignationCard({ selected, main, onSelect, title, text, products, tone }: { selected: boolean; main?: boolean; onSelect: () => void; title: string; text: string; products: string[]; tone?: "amber" }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      role="checkbox"
      aria-checked={selected}
      className={cn("w-full rounded-xl border p-3 text-left transition-colors", selected ? "border-primary bg-primary/[0.06] ring-1 ring-primary/30" : tone === "amber" ? "border-amber-500/40 hover:bg-amber-500/5" : "border-border/70 hover:border-primary/40 hover:bg-muted/30")}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}{main && <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">Main</span>}</span>
        {selected && <CheckCircle2 className="size-4 shrink-0 text-primary" />}
      </span>
      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{text}</span>
      {products.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1">
          {products.slice(0, 8).map((p) => <Badge key={p} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">{p}</Badge>)}
          {products.length > 8 && <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">+{products.length - 8}</Badge>}
        </span>
      )}
    </button>
  );
}
