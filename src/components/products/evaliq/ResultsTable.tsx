"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { publishResultsAction } from "@/app/(products)/evaliq/(protected)/actions";
import { cn } from "@/lib/utils";

export interface ResultTableRow {
  id: string;
  candidate: string;
  kind: string;
  context: string;
  test: string;
  testId: string;
  attemptNo: number;
  submitted: string;
  reason: string | null;
  status: string;
  score: string;
  pct: string;
  passed: boolean | null;
  provisional: boolean;
  released: boolean;
  pending: number;
  violations: number;
}

/** Results list with bulk "publish results" for held (manual-release) results. */
export default function ResultsTable({ rows, canPublish }: { rows: ResultTableRow[]; canPublish: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const publishable = rows.filter((r) => r.status === "evaluated" && !r.released);
  return (
    <div className="space-y-2">
      {canPublish && publishable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={sel.size > 0 && sel.size === publishable.length} onChange={(e) => setSel(e.target.checked ? new Set(publishable.map((r) => r.id)) : new Set())} />
            {`Select all ${publishable.length} unreleased evaluated result${publishable.length === 1 ? "" : "s"} on this page`}
          </label>
          <Button
            size="sm"
            disabled={pending || sel.size === 0}
            onClick={() =>
              start(async () => {
                const res = await publishResultsAction(Array.from(sel));
                if (!res.ok) toast.error(res.error);
                else {
                  toast.success(`${res.published} result${res.published === 1 ? "" : "s"} published${res.skipped ? ` · ${res.skipped} skipped (admin-only or not evaluated)` : ""}`);
                  setSel(new Set());
                  router.refresh();
                }
              })
            }
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Megaphone className="size-3.5" />} {`Publish ${sel.size || ""} result${sel.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {canPublish && publishable.length > 0 && <TableHead className="w-8" />}
            <TableHead>Candidate</TableHead>
            <TableHead>Test</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Released</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const can = r.status === "evaluated" && !r.released;
            return (
              <TableRow key={r.id}>
                {canPublish && publishable.length > 0 && (
                  <TableCell>{can && <input type="checkbox" aria-label={`Select ${r.candidate}`} className="size-4 accent-[var(--primary)]" checked={sel.has(r.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />}</TableCell>
                )}
                <TableCell className="max-w-[200px]">
                  <Link href={`/evaliq/results/${r.id}`} className="block truncate font-medium hover:text-primary">{r.candidate}</Link>
                  <p className="truncate text-[11px] text-muted-foreground">{`${r.kind}${r.context ? ` · ${r.context}` : ""}`}</p>
                </TableCell>
                <TableCell className="max-w-[220px] text-sm">
                  <Link href={`/evaliq/tests/${r.testId}`} className="line-clamp-2 hover:text-primary">{r.test}</Link>
                  <p className="text-[11px] text-muted-foreground">{`Attempt ${r.attemptNo}${r.violations ? ` · ${r.violations} violation${r.violations === 1 ? "" : "s"}` : ""}`}</p>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {r.submitted}
                  {r.reason && r.reason !== "MANUAL" && <p className="text-amber-600">{r.reason}</p>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.score}</TableCell>
                <TableCell className="text-right tabular-nums">{r.pct}</TableCell>
                <TableCell>
                  {r.status === "pending_evaluation" ? (
                    <Link href={`/evaliq/results/${r.id}`} className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 hover:underline dark:text-violet-400">{`Evaluate (${r.pending})`}</Link>
                  ) : (
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", r.passed ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600")}>{r.passed ? "Pass" : "Fail"}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">{r.released ? "Yes" : <span className="text-muted-foreground">No</span>}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
