"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Mail, KeyRound, Pencil, Eye, PenLine, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PersonDetails } from "@/lib/products/commandos/people-rules";
import type { PersonValidation } from "@/lib/products/commandos/people";
import type { OrgOption } from "@/lib/platform/organization/rules";

/** Step 3: everything that will be saved, in plain words. Each section has an edit link back to its step. */
export default function PersonPreview({
  details,
  validation,
  loading,
  org,
  isDirector,
  mode,
  onEdit,
  fromLegacyRoles,
}: {
  details: PersonDetails;
  validation: PersonValidation | null;
  loading: boolean;
  org: { departments: OrgOption[]; teams: OrgOption[]; designations: OrgOption[] };
  isDirector: boolean;
  mode: "create" | "edit";
  onEdit: (step: 1 | 2) => void;
  fromLegacyRoles?: boolean;
}) {
  const names = (list: OrgOption[], ids: string[]) => ids.map((id) => list.find((o) => o.value === id)?.label).filter(Boolean) as string[];
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const check = validation?.check ?? null;
  const rows: [string, string][] = [
    ["Name", details.name || "—"],
    ["Work email", details.email || "—"],
    ["Phone", details.phone || "—"],
    ["Joining date", details.joiningDate || "—"],
    ["Type", ({ employee: "Employee", contractor: "Contractor or freelancer", partner: "External partner", system: "System account" } as Record<string, string>)[details.userType] ?? details.userType],
    ["Departments", names(org.departments, details.departmentIds).join(", ") || "—"],
    ["Teams", names(org.teams, details.teamIds).join(", ") || "—"],
    ["Designations", names(org.designations, details.designationIds).map((n, i) => (i === 0 ? `${n} (main title)` : n)).join(", ") || (isDirector ? "Director" : "—")],
  ];

  return (
    <div className="space-y-4">
      {validation?.refusal && (
        <div role="alert" className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">This cannot be saved yet</p>
            <p>{validation.refusal}</p>
          </div>
        </div>
      )}
      {Object.keys(validation?.errors ?? {}).length > 0 && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">Some details need fixing</p>
          <ul className="list-disc pl-5">{Object.entries(validation!.errors).map(([k, v]) => <li key={k}>{v}</li>)}</ul>
          <button type="button" onClick={() => onEdit(1)} className="mt-1 underline">Go to step 1</button>
        </div>
      )}

      <section className="rounded-2xl border border-border/50 bg-card p-4" aria-label="Person details">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Person details</h3>
          <button type="button" onClick={() => onEdit(1)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Pencil className="size-3" aria-hidden />Edit</button>
        </div>
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2"><dt className="w-28 shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0 break-words font-medium">{v}</dd></div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border border-border/50 bg-card p-4" aria-label="Access summary">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Access {check ? `(${check.products} product${check.products === 1 ? "" : "s"})` : ""}</h3>
          {!isDirector && <button type="button" onClick={() => onEdit(2)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Pencil className="size-3" aria-hidden />Edit</button>}
        </div>
        {isDirector && <p className="mb-2 text-sm text-muted-foreground">A Director always has full access in every product and it cannot be changed.</p>}
        {fromLegacyRoles && mode === "edit" && !isDirector && (
          <p className="mb-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">This person&apos;s access was set up before this screen existed. It is shown here exactly as it works today; saving keeps it the same unless you change it.</p>
        )}
        {loading && <p className="text-sm text-muted-foreground" role="status">Checking access…</p>}
        {check && !isDirector && (
          <>
            {check.addedAutomatically.length > 0 && (
              <p className="mb-2 rounded-lg border border-border/50 bg-muted/40 p-2 text-xs text-muted-foreground">
                <strong className="text-foreground">Included automatically:</strong> {check.addedAutomatically.join(", ")}. These are the basics of the products you chose.
              </p>
            )}
            {check.withheld.length > 0 && (
              <p className="mb-2 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>Saved, but not available in every part of the product yet: {check.withheld.join(", ")}. The newer checks apply them; older screens will still say no until they are updated.</span>
              </p>
            )}
            <ul className="space-y-2">
              {check.summary.filter((s) => s.level !== "none").map((s) => (
                <li key={s.key} className="rounded-xl border border-border/40 p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{s.name}</p>
                    <Badge variant="outline" className={`text-[10px] ${s.level === "write" ? "border-primary/30 bg-primary/10 text-primary" : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"}`}>{s.level === "write" ? "Read & Write" : "Read only"}</Badge>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                    <div><p className="mb-1 flex items-center gap-1 font-semibold text-foreground"><PenLine className="size-3" aria-hidden />Can do ({s.canDo.length})</p><p className="text-muted-foreground">{s.canDo.length ? s.canDo.join(", ") : "Nothing that changes data"}</p></div>
                    <div><p className="mb-1 flex items-center gap-1 font-semibold text-foreground"><Eye className="size-3" aria-hidden />Can only view ({s.canView.length})</p><p className="text-muted-foreground">{s.canView.length ? s.canView.join(", ") : "—"}</p></div>
                    <div>
                      <p className="mb-1 flex items-center gap-1 font-semibold text-foreground"><Ban className="size-3" aria-hidden />Cannot ({s.cannot.length})</p>
                      <p className="text-muted-foreground">{s.cannot.length === 0 ? "—" : showAll[s.key] || s.cannot.length <= 4 ? s.cannot.join(", ") : `${s.cannot.slice(0, 4).join(", ")} and ${s.cannot.length - 4} more`}</p>
                      {s.cannot.length > 4 && <button type="button" onClick={() => setShowAll((x) => ({ ...x, [s.key]: !x[s.key] }))} className="mt-0.5 text-primary hover:underline">{showAll[s.key] ? "Show less" : "Show all"}</button>}
                    </div>
                  </div>
                </li>
              ))}
              {check.summary.every((s) => s.level === "none") && <li className="text-sm text-muted-foreground">No product access chosen.</li>}
            </ul>
          </>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Seats and invitation">
        <div className={`rounded-2xl border p-4 ${validation && !validation.seats.ok ? "border-destructive/40 bg-destructive/10" : "border-border/50 bg-card"}`}>
          <h3 className="mb-1 text-sm font-semibold">Seats</h3>
          <p className="text-sm text-muted-foreground">{validation ? validation.seats.message : "Checking…"}</p>
          {validation && !validation.seats.ok && <Link href="/commandos/settings/billing" className="mt-1 inline-block text-sm font-medium text-primary underline">Upgrade your plan</Link>}
        </div>
        {mode === "create" && (
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">{details.invite === "email" ? <Mail className="size-4" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}Invitation</h3>
            <p className="text-sm text-muted-foreground">
              {details.invite === "email"
                ? `An email goes to ${details.email || "the person"} with a link to set their own password. The link works for 7 days.`
                : "A temporary password is shown once after you create the person. They must change it the first time they sign in."}
            </p>
          </div>
        )}
        {validation?.ok && <p className="flex items-center gap-1.5 text-sm text-emerald-700 sm:col-span-2 dark:text-emerald-300"><CheckCircle2 className="size-4" aria-hidden />Everything checks out.</p>}
      </section>
    </div>
  );
}
