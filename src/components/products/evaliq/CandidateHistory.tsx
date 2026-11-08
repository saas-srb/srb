import Link from "next/link";
import { Trophy } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { EmptyState, PassBadge, Chip } from "@/components/products/evaliq/OtsUi";
import { fmtDuration, fmtMarks, fmtPct } from "@/lib/products/evaliq/constants";
import { formatDateTime } from "@/lib/utils";
import type { HistoryRow } from "@/lib/products/evaliq/candidate";
import type { CandidatePaths } from "@/lib/products/evaliq/taker";

/** Complete result history (every attempt) for one candidate — OTS "My Results" and the Portal's results tab. */
export default function CandidateHistory({ rows, paths }: { rows: HistoryRow[]; paths: CandidatePaths }) {
  return (
    <GlassCard interactive={false}>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={<Trophy className="size-5" />} title="No results yet">Finished tests appear here with their scores once results are released.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Percentage</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Time taken</TableHead>
                <TableHead>Certificate</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.attemptId}>
                  <TableCell className="max-w-xs">
                    <Link href={`${paths.results}/${r.attemptId}`} className="font-medium hover:text-primary">{r.testName}</Link>
                    {r.category && <p className="text-[11px] text-muted-foreground">{r.category}</p>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {`#${r.attemptNo}`}
                    {r.submitReason && r.submitReason !== "MANUAL" && <p><Chip tone="amber">{r.submitReason === "TIMEOUT_AUTO_SUBMISSION" ? "Timed out" : "Auto-submitted"}</Chip></p>}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(r.submittedAt ?? r.startedAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.visible && r.score !== null ? `${fmtMarks(r.score)}/${fmtMarks(r.total)}` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.visible ? fmtPct(r.percentage) : "—"}</TableCell>
                  <TableCell>{r.visible ? <PassBadge passed={r.passed} provisional={r.provisional} /> : <span className="text-xs text-muted-foreground">{r.status === "pending_evaluation" ? "Awaiting evaluation" : "Not released"}</span>}</TableCell>
                  <TableCell className="text-xs">{fmtDuration(r.timeTakenSec)}</TableCell>
                  <TableCell className="text-xs">{r.certificate ? <Link href={paths.certificates} className="text-primary hover:underline">{r.certificate.number}</Link> : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`${paths.results}/${r.attemptId}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                    >
                      Review Answers
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </GlassCard>
  );
}
