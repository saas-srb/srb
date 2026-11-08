import Link from "next/link";
import { ShieldCheck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import StartTestButton from "@/components/products/evaliq/StartTestButton";
import { SectionCard, Stat, Notice, AssignmentStatusBadge, PassBadge, Chip } from "@/components/products/evaliq/OtsUi";
import { fmtDuration, fmtPct } from "@/lib/products/evaliq/constants";
import { formatDateTime } from "@/lib/utils";
import type { candidateAssignment } from "@/lib/products/evaliq/candidate";
import type { Channel, CandidatePaths } from "@/lib/products/evaliq/taker";

type Data = Awaited<ReturnType<typeof candidateAssignment>>;

/** A candidate's view of one assigned test: instructions, rules, security notice, attempts and the Start button. */
export default function CandidateAssignment({ data, channel, paths }: { data: Data; channel: Channel; paths: CandidatePaths }) {
  const { card, attempts, instructions, assignmentInstructions, security, rules } = data;
  const sec = [security.requireFullscreen && "full screen is required", security.detectTabSwitch && "switching tabs or windows is recorded", security.blockCopyPaste && "copy / paste is disabled", security.blockRightClick && "right-click is disabled", security.singleSession && "the test can be open in one window at a time", security.maxViolations && `the test is submitted automatically after ${security.maxViolations} violations`].filter(Boolean);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Duration" value={card.durationMinutes ? `${card.durationMinutes} min` : "Untimed"} />
        <Stat label="Questions" value={card.questions ?? "—"} />
        <Stat label="Total marks" value={card.totalMarks !== null ? `${card.marksVary ? "≈" : ""}${card.totalMarks}` : "—"} />
        <Stat label="Pass mark" value={card.passing} />
        <Stat label="Attempts left" value={Math.max(card.attemptsAllowed - card.attemptsUsed, 0)} hint={`${card.attemptsUsed} of ${card.attemptsAllowed} used`} />
        <Stat label="Due" value={<span className="text-sm">{card.dueAt ? formatDateTime(card.dueAt) : "No due date"}</span>} hint={card.opensAt ? `Opens ${formatDateTime(card.opensAt)}` : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <SectionCard title="Instructions">
            {assignmentInstructions && <p className="mb-3 rounded-xl bg-primary/5 px-3 py-2 text-sm whitespace-pre-wrap">{assignmentInstructions}</p>}
            {instructions ? <p className="text-sm whitespace-pre-wrap">{instructions}</p> : !assignmentInstructions && <p className="text-sm text-muted-foreground">No special instructions.</p>}
            <ul className="mt-4 space-y-1.5 text-sm">
              {rules.map((r) => (
                <li key={r} className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0 text-primary" />{r}</li>
              ))}
            </ul>
          </SectionCard>
          {sec.length > 0 && (
            <Notice>
              <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="size-4" /> Exam security</p>
              <p className="mt-1 text-xs">{`During this test ${sec.join(", ")}. Your IP address and browser are recorded with the attempt.`}</p>
            </Notice>
          )}
        </div>
        <div className="space-y-4 self-start">
          <SectionCard title="Your test" action={<AssignmentStatusBadge status={card.status} />}>
            {card.canResume ? (
              <StartTestButton channel={channel} assignmentId={card.assignmentId} examBase={paths.exam} mode="continue" />
            ) : card.canStart ? (
              <StartTestButton channel={channel} assignmentId={card.assignmentId} examBase={paths.exam} mode={card.attemptsUsed > 0 ? "retake" : "start"} needsAck />
            ) : (
              <p className="text-sm text-muted-foreground">{card.blockedReason ?? (card.bucket === "completed" ? "You have completed this test." : "Not available right now.")}</p>
            )}
            {card.late && card.canStart && <p className="mt-2 text-xs text-amber-700">Past the due date — late start allowed.</p>}
            {card.result && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
                <span className="font-semibold">{`${card.result.score}/${card.result.total}`}</span>
                <span className="text-muted-foreground">{fmtPct(card.result.percentage)}</span>
                <PassBadge passed={card.result.passed} />
                <span className="ml-auto text-[11px] text-muted-foreground">{`${card.result.policy} attempt`}</span>
              </div>
            )}
            {card.certificate && card.certificate.state !== "revoked" && (
              <Button className="mt-3" size="sm" variant="outline" nativeButton={false} render={<Link href={paths.certificates} />}>
                {`View certificate ${card.certificate.number}`}
              </Button>
            )}
          </SectionCard>
          {attempts.length > 0 && (
            <SectionCard title="Attempts">
              <ul className="space-y-2 text-sm">
                {attempts.map((x) => (
                  <li key={x.attemptId} className="flex items-center justify-between gap-2">
                    <span>
                      {`Attempt ${x.attemptNo}`}
                      <span className="block text-[11px] text-muted-foreground">{`${formatDateTime(x.startedAt)}${x.timeTakenSec ? ` · ${fmtDuration(x.timeTakenSec)}` : ""}`}</span>
                      {x.submitReason && x.submitReason !== "MANUAL" && <Chip tone="amber">{x.submitReason}</Chip>}
                    </span>
                    {x.status === "in_progress" ? (
                      <Chip tone="blue">In progress</Chip>
                    ) : (
                      <Link href={`${paths.results}/${x.attemptId}`} className="text-right text-xs text-primary hover:underline">
                        {x.visible && x.percentage !== null ? `${fmtPct(x.percentage)}${x.provisional ? " (provisional)" : ""}` : "View"}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
