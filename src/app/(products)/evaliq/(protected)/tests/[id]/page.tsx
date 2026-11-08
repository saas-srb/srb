import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Users, CheckCheck, Hourglass, Percent, Trophy, Timer, RefreshCw } from "lucide-react";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiLink from "@/components/products/playbook-ai/KpiLink";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import TestActions from "@/components/products/evaliq/TestActions";
import TestStepper from "@/components/products/evaliq/TestStepper";
import { PageHeader, SectionCard, TestStatusBadge, Chip, Notice } from "@/components/products/evaliq/OtsUi";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { effectiveTestStatus, getTest, summarizeTest } from "@/lib/products/evaliq/tests";
import { categoryMap } from "@/lib/products/evaliq/categories";
import { listDispatches } from "@/lib/products/evaliq/assignments";
import { groupAnalytics } from "@/lib/products/evaliq/analytics";
import { getDirectory } from "@/lib/products/evaliq/people";
import { listAudit, AUDIT_ACTION_LABEL } from "@/lib/products/evaliq/audit";
import { resyncDispatchAction } from "@/app/(products)/evaliq/(protected)/actions";
import { OTS_PERMISSIONS } from "@/lib/ots-roles";
import { ATTEMPT_SCORING, DIFFICULTIES, RESULT_DETAILS, RESULT_RELEASES, TEST_TYPES, fmtDuration, fmtPct, labelOf } from "@/lib/products/evaliq/constants";
import { formatDateTime } from "@/lib/utils";

const yes = (b: boolean) => (b ? "Yes" : "No");

export default async function TestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "VIEW_TESTS")) redirect("/evaliq");
  const { id } = await params;
  const t = await getTest(id);
  if (!t) notFound();
  const status = effectiveTestStatus(t);
  const [summary, cats, dispatches, stats, dir, trail] = await Promise.all([
    summarizeTest(t),
    categoryMap("test"),
    listDispatches(id, 20),
    can(viewer, "VIEW_REPORTS") ? groupAnalytics("test", { testId: id }) : Promise.resolve([]),
    getDirectory(),
    listAudit({ testId: id, pageSize: 12 }),
  ]);
  const s = stats[0];
  const perms = Object.fromEntries(OTS_PERMISSIONS.map((p) => [p, can(viewer, p)]));
  const c = t.config;
  const dept = new Map(dir.departments.map((d) => [d.value, d.label]));
  const desig = new Map(dir.designations.map((d) => [d.value, d.label]));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.name}
        crumbs={[{ label: "Tests", href: "/evaliq/tests" }, { label: t.code }]}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <TestStatusBadge status={status} />
            <span>{`${t.code} · ${labelOf(TEST_TYPES, t.testType)} · ${labelOf(DIFFICULTIES, t.difficulty)}${t.categoryId ? ` · ${cats.get(t.categoryId) ?? ""}` : ""}`}</span>
            {t.certificate.enabled && <Chip tone="violet">Certificate on pass</Chip>}
          </span>
        }
        actions={<TestActions id={id} name={t.name} status={status} perms={perms} />}
      />
      {status === "draft" && can(viewer, "EDIT_TEST") && <TestStepper testId={id} current="publish" />}
      {status === "draft" && summary.issues.length > 0 && (
        <Notice tone="warn">
          <p className="font-semibold">Not ready to publish yet:</p>
          <ul className="mt-1 list-disc pl-5">{summary.issues.map((m) => <li key={m}>{m}</li>)}</ul>
        </Notice>
      )}

      {s && (
        <KpiGrid cols={6}>
          <KpiLink href={`/evaliq/assignments?testId=${id}`} label="Assigned" value={s.assigned} accent icon={<Users className="size-4" />} />
          <KpiLink href={`/evaliq/assignments?testId=${id}&status=finished`} label="Completed" value={s.completed} icon={<CheckCheck className="size-4" />} />
          <KpiLink href={`/evaliq/assignments?testId=${id}&status=open`} label="Pending" value={s.pending + s.inProgress} icon={<Hourglass className="size-4" />} />
          <KpiLink href={`/evaliq/results?testId=${id}`} label="Average %" value={<span>{fmtPct(s.avgPercentage)}</span>} icon={<Percent className="size-4" />} />
          <KpiLink href={`/evaliq/results?testId=${id}&result=pass`} label="Pass Rate" value={<span>{fmtPct(s.passRate)}</span>} icon={<Trophy className="size-4" />} />
          <KpiCard label="Avg Time" value={<span>{fmtDuration(s.avgTimeSec)}</span>} icon={<Timer className="size-4" />} />
        </KpiGrid>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Paper" description={`${summary.questionCount} questions${summary.servedCount !== summary.questionCount ? ` (${summary.servedCount} per attempt)` : ""} · ${summary.marksVary ? "≈" : ""}${summary.totalMarks} marks`} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Section</th>
                  <th className="py-1 text-right font-medium">Picked</th>
                  <th className="py-1 text-right font-medium">Drawn by rules</th>
                  <th className="py-1 text-right font-medium">Questions</th>
                  <th className="py-1 text-right font-medium">Marks</th>
                  <th className="py-1 text-right font-medium">Time limit</th>
                </tr>
              </thead>
              <tbody>
                {summary.sections.map((x) => (
                  <tr key={x.id} className="border-t border-border/40">
                    <td className="py-1.5">{x.title}</td>
                    <td className="py-1.5 text-right tabular-nums">{x.manualCount}</td>
                    <td className="py-1.5 text-right tabular-nums">{x.ruleCount}</td>
                    <td className="py-1.5 text-right tabular-nums">{x.questionCount}</td>
                    <td className="py-1.5 text-right tabular-nums">{`${x.marksVary ? "≈" : ""}${x.marks}`}</td>
                    <td className="py-1.5 text-right">{x.timeLimitMinutes ? `${x.timeLimitMinutes} min` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {t.description && <p className="mt-3 text-sm whitespace-pre-wrap text-muted-foreground">{t.description}</p>}
          {(t.departmentIds.length > 0 || t.designationIds.length > 0) && (
            <p className="mt-2 flex flex-wrap gap-1 text-xs">
              {t.departmentIds.map((d) => <Chip key={d} tone="blue">{dept.get(d) ?? "Department"}</Chip>)}
              {t.designationIds.map((d) => <Chip key={d}>{desig.get(d) ?? "Role"}</Chip>)}
            </p>
          )}
        </SectionCard>
        <SectionCard title="Configuration">
          <dl className="space-y-1 text-xs">
            {[
              ["Duration", c.durationMinutes ? `${c.durationMinutes} min${c.autoSubmit ? " · auto-submit" : " · advisory"}` : "Untimed"],
              ["Window", c.startAt || c.endAt ? `${c.startAt ? formatDateTime(c.startAt) : "now"} → ${c.endAt ? formatDateTime(c.endAt) : "open-ended"}` : "Always open"],
              ["Pass mark", c.passMode === "percentage" ? `${c.passingPercentage}%` : `${c.passingMarks} marks`],
              ["Attempts", c.allowRetake ? `${c.maxAttempts} (${labelOf(ATTEMPT_SCORING, c.attemptScoring)})${c.retakeOnlyIfFailed ? " · only if failed" : ""}` : "1"],
              ["Shuffle", [c.randomizeQuestions && "questions", c.randomizeOptions && "options"].filter(Boolean).join(" + ") || "No"],
              ["Negative marking", yes(c.negativeMarking)],
              ["Navigation", `${c.allowNavigation ? "Free" : "Sequential"}${c.allowBack ? "" : " · no going back"}${c.allowReview ? " · review" : ""}`],
              ["Results", `${labelOf(RESULT_RELEASES, c.resultRelease)} · ${labelOf(RESULT_DETAILS, c.resultDetail)}${c.showExplanations ? " · explanations" : ""}`],
              ["Security", [c.security.requireFullscreen && "full screen", c.security.detectTabSwitch && "tab detection", c.security.blockCopyPaste && "no copy/paste", c.security.blockRightClick && "no right-click", c.security.singleSession && "single window", c.security.maxViolations && `auto-submit after ${c.security.maxViolations}`].filter(Boolean).join(", ") || "None"],
              ["Certificate", t.certificate.enabled ? `${t.certificate.title || "Yes"}${t.certificate.validityMonths ? ` · ${t.certificate.validityMonths} months` : ""}` : "No"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Assignments" description="Each rule is resolved live against TalentOS / Careers / Cohort AI. Re-sync assigns the test to people who joined a department, role or batch since.">
          {dispatches.length === 0 ? (
            <p className="text-xs text-muted-foreground">Not assigned yet.</p>
          ) : (
            <ul className="divide-y divide-border/40 text-sm">
              {dispatches.map((d) => (
                <li key={d._id} className="flex items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link href={`/evaliq/assignments?dispatchId=${d._id}`} className="hover:text-primary">{d.targetSummary}</Link>
                    <p className="text-[11px] text-muted-foreground">{`${d.created} assigned${d.skipped ? ` · ${d.skipped} skipped` : ""} · ${formatDateTime(d.createdAt)}${d.dueAt ? ` · due ${formatDateTime(d.dueAt)}` : ""}`}</p>
                  </div>
                  {can(viewer, "ASSIGN_TEST") && (status === "active" || status === "published") && (
                    <ActionButton action={resyncDispatchAction.bind(null, d._id)} size="xs" success="Re-synced" aria-label="Re-sync">
                      <RefreshCw className="size-3" />
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Activity" action={can(viewer, "VIEW_AUDIT_LOG") ? <Link href={`/evaliq/activity?testId=${id}`} className="text-xs text-primary hover:underline">All</Link> : undefined}>
          <ul className="space-y-1.5 text-xs">
            {trail.items.length === 0 && <li className="text-muted-foreground">No activity yet.</li>}
            {trail.items.map((a) => (
              <li key={a._id}>
                <span className="font-medium">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</span>
                <span className="text-muted-foreground">{` · ${a.entityLabel ?? ""} · ${a.actorEmail ?? a.actorId} · ${formatDateTime(a.createdAt)}`}</span>
                {a.summary && <p className="text-muted-foreground">{a.summary}</p>}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
