import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Megaphone, Award, ShieldAlert } from "lucide-react";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import ResultReport from "@/components/products/evaliq/ResultReport";
import { PageHeader, SectionCard, Chip, Notice } from "@/components/products/evaliq/OtsUi";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { buildResultView, getAttempt } from "@/lib/products/evaliq/attempts";
import { getAssignment, effectiveRelease } from "@/lib/products/evaliq/assignments";
import { getTest } from "@/lib/products/evaliq/tests";
import { describeCandidates } from "@/lib/products/evaliq/people";
import { certificatesForAssignments } from "@/lib/products/evaliq/certificates";
import { generateCertificateAction, publishResultsAction } from "@/app/(products)/evaliq/(protected)/actions";
import { CANDIDATE_KINDS, RESULT_RELEASES, SECURITY_EVENT_TYPES, VIOLATION_EVENTS, labelOf } from "@/lib/products/evaliq/constants";
import { formatDateTime } from "@/lib/utils";

export default async function StaffResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "VIEW_REPORTS") && !can(viewer, "EVALUATE_ANSWERS")) redirect("/evaliq");
  const { attemptId } = await params;
  const att = await getAttempt(attemptId);
  if (!att) notFound();
  const [a, t] = await Promise.all([getAssignment(att.assignmentId), getTest(att.testId)]);
  if (!a) notFound();
  const [people, certs] = await Promise.all([describeCandidates([att.candidate]), certificatesForAssignments([a._id])]);
  const p = people.get(att.candidateKey);
  const cert = certs.get(a._id);
  const view = buildResultView(att, a, t, true);
  const policy = t ? effectiveRelease(a, t) : "manual";
  const name = p?.exists ? p.name : a.candidateLabel;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${name} · ${att.testName}`}
        crumbs={[{ label: "Results", href: "/evaliq/results" }, { label: `${name} · attempt ${att.attemptNo}` }]}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip>{labelOf(CANDIDATE_KINDS, att.candidate.kind)}</Chip>
            {p?.email && <span>{p.email}</span>}
            {p?.departmentName && <span>{`· ${p.departmentName}`}</span>}
            {p?.designationName && <span>{`· ${p.designationName}`}</span>}
            {p?.positionTitle && <span>{`· ${p.positionTitle} (${p.applicationStatus})`}</span>}
            {p?.batchNames.length ? <span>{`· ${p.batchNames.join(", ")}`}</span> : null}
          </span>
        }
        actions={
          <>
            {can(viewer, "PUBLISH_RESULTS") && att.status === "evaluated" && !att.resultPublishedAt && policy !== "never" && (
              <ActionButton action={publishResultsAction.bind(null, [attemptId])} variant="default" success="Result published to the candidate">
                <Megaphone className="size-3.5" /> Publish result
              </ActionButton>
            )}
            {can(viewer, "GENERATE_CERTIFICATE") && t?.certificate.enabled && a.result?.passed && !cert && (
              <ActionButton action={generateCertificateAction.bind(null, a._id)} success="Certificate issued">
                <Award className="size-3.5" /> Issue certificate
              </ActionButton>
            )}
          </>
        }
      />
      <Notice tone={att.resultPublishedAt ? "ok" : "info"}>
        {`Result visibility: ${labelOf(RESULT_RELEASES, policy)} — ${att.resultPublishedAt ? `released to the candidate ${formatDateTime(att.resultPublishedAt)}.` : "not visible to the candidate yet."}`}
        {cert && <span>{` Certificate ${cert.certificateNumber}${cert.revoked ? " (revoked)" : ""}.`}</span>}
        {" "}
        <Link href={`/evaliq/assignments?testId=${a.testId}&q=${encodeURIComponent(a.candidateLabel)}`} className="text-primary hover:underline">Assignment</Link>
      </Notice>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ResultReport view={view} candidateName={name} evaluator={{ canEvaluate: can(viewer, "EVALUATE_ANSWERS"), canOverride: can(viewer, "OVERRIDE_MARKS"), negatives: att.paper.map((x) => x.negativeMarks) }} />
        <div className="space-y-4 self-start">
          <SectionCard title="Attempt details">
            <dl className="space-y-1 text-xs">
              {[
                ["Attempt", `${att.attemptNo}`],
                ["Started", formatDateTime(att.startedAt)],
                ["Submitted", att.submittedAt ? formatDateTime(att.submittedAt) : "—"],
                ["Submission", att.submitReason ?? "—"],
                ["Deadline", att.deadlineAt ? formatDateTime(att.deadlineAt) : "None"],
                ["Channel", att.client.channel === "portal" ? "External Portal" : "EvalIQ product"],
                ["Start IP", att.client.startIp ?? "—"],
                ["Last IP", att.client.lastIp ?? "—"],
                ["Violations", String(att.violations)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right break-all">{v}</dd>
                </div>
              ))}
            </dl>
            {att.client.startUserAgent && <p className="mt-2 text-[11px] break-all text-muted-foreground">{att.client.startUserAgent}</p>}
          </SectionCard>
          <SectionCard title="Security events" description="Recorded during the attempt. They make misconduct visible; they do not prove it.">
            {att.events.length === 0 ? (
              <p className="text-xs text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="max-h-96 space-y-1.5 overflow-y-auto text-xs">
                {att.events.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <ShieldAlert className={`mt-0.5 size-3.5 shrink-0 ${VIOLATION_EVENTS.includes(e.type) ? "text-rose-500" : "text-amber-500"}`} />
                    <span>
                      <span className="font-medium">{SECURITY_EVENT_TYPES[e.type] ?? e.type}</span>
                      <span className="block text-muted-foreground">{`${formatDateTime(e.at)}${e.detail ? ` · ${e.detail}` : ""}`}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
