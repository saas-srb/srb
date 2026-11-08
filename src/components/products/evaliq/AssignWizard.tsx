"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Users, AlertTriangle, Send, UserX, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import MultiPicker from "@/components/products/playbook-ai/MultiPicker";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assignTestAction, previewAssignmentAction } from "@/app/(products)/evaliq/(protected)/actions";
import { ASSIGNMENT_STATUSES, CANDIDATE_KINDS, PRIORITIES, RESULT_DETAILS, RESULT_RELEASES, TARGET_TYPES, labelOf, type TargetType } from "@/lib/products/evaliq/constants";
import type { Directory } from "@/lib/products/evaliq/people";
import type { PreviewRow } from "@/lib/products/evaliq/assignments";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string; sub?: string };

const DIR_KEY: Record<TargetType, keyof Directory> = {
  department: "departments",
  designation: "designations",
  team: "teams",
  employment_type: "employmentTypes",
  employee: "employees",
  platform_role: "platformRoles",
  user: "users",
  applicant: "applicants",
  applicant_position: "positions",
  student: "students",
  batch: "batches",
  program: "programs",
};

const APPLICANT_STATUSES = [
  { value: "new", label: "New" },
  { value: "under_review", label: "Under Review" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview_scheduled", label: "Interview Scheduled" },
  { value: "selected", label: "Selected" },
];

export default function AssignWizard({ tests, directory, initialTestId, initialTargets }: { tests: Opt[]; directory: Directory; initialTestId: string; initialTargets: { type: TargetType; ids: string[] }[] }) {
  const router = useRouter();
  const [testId, setTestId] = useState(initialTestId);
  const [targets, setTargets] = useState<{ type: TargetType; ids: string[] }[]>(initialTargets.length ? initialTargets : [{ type: "department", ids: [] }]);
  const [applicantStatuses, setApplicantStatuses] = useState<string[]>([]);
  const [rules, setRules] = useState({ startAt: "", dueAt: "", maxAttempts: "", priority: "normal", instructions: "", notify: true, resultRelease: "", resultDetail: "", certificateEligible: true, allowLateStart: false });
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; newCount: number; duplicateCount: number } | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [previewing, startPreview] = useTransition();
  const [assigning, startAssign] = useTransition();
  const [q, setQ] = useState("");

  const payload = () => ({
    testId,
    targets: targets.filter((t) => t.ids.length),
    applicantStatuses,
    ...rules,
    startAt: rules.startAt ? new Date(rules.startAt).toISOString() : "",
    dueAt: rules.dueAt ? new Date(rules.dueAt).toISOString() : "",
    resultRelease: rules.resultRelease || null,
    resultDetail: rules.resultDetail || null,
  });

  function runPreview() {
    startPreview(async () => {
      const res = await previewAssignmentAction(payload());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPreview(res);
      setExcluded(new Set());
    });
  }

  function assign() {
    startAssign(async () => {
      const res = await assignTestAction({ ...payload(), excludeKeys: Array.from(excluded) });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`Assigned to ${res.created} ${res.created === 1 ? "person" : "people"}${res.skipped ? ` · ${res.skipped} skipped` : ""}`);
        router.push(`/evaliq/assignments?dispatchId=${res.dispatchId}`);
      }
    });
  }

  const hasApplicantPositions = targets.some((t) => t.type === "applicant_position" && t.ids.length);
  const toAssign = preview ? preview.rows.filter((r) => !r.existing && !excluded.has(r.key)).length : 0;
  const shown = useMemo(() => {
    if (!preview) return [];
    const s = q.trim().toLowerCase();
    return s ? preview.rows.filter((r) => r.label.toLowerCase().includes(s)) : preview.rows;
  }, [preview, q]);
  const groups = Array.from(new Set(TARGET_TYPES.map((t) => t.group)));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <GlassCard interactive={false}>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold">1 · Test</CardTitle>
          </CardHeader>
          <CardContent>
            <OptionSelect
              value={testId}
              onChange={(v) => {
                setTestId(v);
                setPreview(null);
              }}
              options={tests.map((t) => ({ value: t.value, label: `${t.label} (${t.sub})` }))}
              placeholder="Choose a published test"
              aria-label="Test"
            />
            {tests.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No published tests yet — publish a test first.</p>}
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold">2 · Who</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[11px] text-muted-foreground">People are read live from TalentOS (employees, departments, roles, teams), Careers (applicants) and Cohort AI (students, batches, courses). Combine as many targets as you like — each person is assigned once.</p>
            {targets.map((t, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-2">
                  <OptionSelect
                    value={t.type}
                    onChange={(v) => {
                      setTargets((xs) => xs.map((x, j) => (j === i ? { type: v as TargetType, ids: [] } : x)));
                      setPreview(null);
                    }}
                    options={groups.flatMap((g) => TARGET_TYPES.filter((x) => x.group === g).map((x) => ({ value: x.value, label: `${g} · ${x.label}` })))}
                    aria-label="Target type"
                  />
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove target" disabled={targets.length === 1} onClick={() => setTargets((xs) => xs.filter((_, j) => j !== i))}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <MultiPicker
                  options={(directory[DIR_KEY[t.type]] as Opt[]).map((o) => ({ id: o.value, label: o.label, sub: o.sub }))}
                  value={t.ids}
                  onChange={(ids) => {
                    setTargets((xs) => xs.map((x, j) => (j === i ? { ...x, ids } : x)));
                    setPreview(null);
                  }}
                  placeholder={`Search ${labelOf(TARGET_TYPES, t.type).toLowerCase()}…`}
                  emptyLabel={`Nothing found in ${TARGET_TYPES.find((x) => x.value === t.type)?.source}.`}
                />
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setTargets((xs) => [...xs, { type: "designation", ids: [] }])}>
              <Plus className="size-3.5" /> Add another target
            </Button>
            {hasApplicantPositions && (
              <div className="space-y-1.5">
                <Label>Only applicants at these stages (optional)</Label>
                <MultiPicker options={APPLICANT_STATUSES.map((s) => ({ id: s.value, label: s.label }))} value={applicantStatuses} onChange={(v) => { setApplicantStatuses(v); setPreview(null); }} maxHeight="max-h-32" />
              </div>
            )}
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold">3 · Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="a-start">Start date</Label>
                <Input id="a-start" type="datetime-local" value={rules.startAt} onChange={(e) => setRules((r) => ({ ...r, startAt: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-due">Due date</Label>
                <Input id="a-due" type="datetime-local" value={rules.dueAt} onChange={(e) => setRules((r) => ({ ...r, dueAt: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-max">Attempt limit</Label>
                <Input id="a-max" type="number" min={1} max={50} value={rules.maxAttempts} onChange={(e) => setRules((r) => ({ ...r, maxAttempts: e.target.value }))} placeholder="Test default" />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <OptionSelect value={rules.priority} onChange={(v) => setRules((r) => ({ ...r, priority: v }))} options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} aria-label="Priority" />
              </div>
              <div className="space-y-1.5">
                <Label>Result visibility</Label>
                <OptionSelect value={rules.resultRelease} onChange={(v) => setRules((r) => ({ ...r, resultRelease: v }))} options={RESULT_RELEASES.map((x) => ({ value: x.value, label: x.label }))} noneLabel="Test default" aria-label="Result visibility" />
              </div>
              <div className="space-y-1.5">
                <Label>Result detail</Label>
                <OptionSelect value={rules.resultDetail} onChange={(v) => setRules((r) => ({ ...r, resultDetail: v }))} options={RESULT_DETAILS.map((x) => ({ value: x.value, label: x.label }))} noneLabel="Test default" aria-label="Result detail" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-instr">Instructions for this assignment</Label>
              <Textarea id="a-instr" value={rules.instructions} onChange={(e) => setRules((r) => ({ ...r, instructions: e.target.value }))} rows={2} />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["notify", "Notify people now", "Staff bell + Portal bell"],
                ["certificateEligible", "Certificate eligible", "If the test issues certificates"],
                ["allowLateStart", "Allow late start", "Can still start after the due date"],
              ].map(([k, label, hint]) => (
                <label key={k} className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/50 px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={rules[k as "notify"]} onChange={(e) => setRules((r) => ({ ...r, [k]: e.target.checked }))} />
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-[11px] text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </CardContent>
        </GlassCard>
      </div>

      <div className="space-y-4 self-start xl:sticky xl:top-0">
        <GlassCard interactive={false}>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold">4 · Review & assign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button type="button" variant="outline" onClick={runPreview} disabled={previewing || !testId || targets.every((t) => !t.ids.length)}>
              {previewing ? <Loader2 className="size-3.5 animate-spin" /> : <Users className="size-3.5" />} Find eligible people
            </Button>
            {preview && (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-border/40 py-2">
                    <p className="text-xl font-bold">{preview.rows.length}</p>
                    <p className="text-[11px] text-muted-foreground">matched</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 py-2">
                    <p className="text-xl font-bold text-amber-600">{preview.duplicateCount}</p>
                    <p className="text-[11px] text-muted-foreground">already assigned</p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 py-2">
                    <p className="text-xl font-bold text-emerald-600">{toAssign}</p>
                    <p className="text-[11px] text-muted-foreground">will be assigned</p>
                  </div>
                </div>
                {preview.duplicateCount > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {`${preview.duplicateCount} ${preview.duplicateCount === 1 ? "person already has" : "people already have"} an active assignment of this test and will be skipped — never assigned twice.`}
                  </p>
                )}
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter people…" aria-label="Filter people" className="h-8" />
                <ul className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
                  {shown.slice(0, 500).map((r) => {
                    const off = excluded.has(r.key);
                    return (
                      <li key={r.key} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm", r.existing ? "border-amber-500/30 bg-amber-500/5" : off ? "border-border/40 opacity-50" : "border-border/40")}>
                        {!r.existing && (
                          <input type="checkbox" aria-label={`Include ${r.label}`} className="size-4 accent-[var(--primary)]" checked={!off} onChange={() => setExcluded((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })} />
                        )}
                        {r.existing && <UserX className="size-4 shrink-0 text-amber-600" />}
                        <span className="min-w-0 flex-1 truncate">{r.label}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{`${labelOf(CANDIDATE_KINDS, r.ref.kind)} · ${r.via.join(", ")}`}</span>
                        {r.existing && <span className="shrink-0 text-[11px] font-medium text-amber-700 dark:text-amber-400">{labelOf(ASSIGNMENT_STATUSES, r.existing.status)}</span>}
                        {!r.existing && r.completedBefore && <span title="Completed this test before"><History className="size-3.5 shrink-0 text-muted-foreground" /></span>}
                      </li>
                    );
                  })}
                  {shown.length > 500 && <li className="py-1 text-center text-[11px] text-muted-foreground">{`+${shown.length - 500} more`}</li>}
                </ul>
                <Button type="button" className="w-full" onClick={assign} disabled={assigning || toAssign === 0}>
                  {assigning ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {`Assign to ${toAssign} ${toAssign === 1 ? "person" : "people"}`}
                </Button>
                <p className="text-[11px] text-muted-foreground">Applicants and students see the test in their Portal (once they have a portal account); employees and staff in EvalIQ → My Tests.</p>
              </>
            )}
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}
