"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { GitCompare, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { revertToVersionAction } from "@/app/(products)/playbook-ai/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

export interface VersionRow {
  version: string;
  previousVersion: string | null;
  changeType: "initial" | "minor" | "major";
  changeSummary: string;
  authorName: string;
  publishedAt: string;
  isCurrent: boolean;
}

/** Change history: every published version (immutable), with compare and — for editors — "load into draft". */
export default function VersionsPanel({ sopId, rows, canEdit, canCompare }: { sopId: string; rows: VersionRow[]; canEdit: boolean; canCompare: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const options = rows.map((r) => ({ value: r.version, label: `v${r.version}${r.isCurrent ? " (current)" : ""}` }));
  const [from, setFrom] = useState(rows[1]?.version ?? rows[0]?.version ?? "");
  const [to, setTo] = useState(rows[0]?.version ?? "");

  function load(version: string) {
    startTransition(async () => {
      const res = await revertToVersionAction(sopId, version);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`v${version} loaded into the draft — review it, then publish to create a new version.`);
      router.push(`/playbook-ai/library/${sopId}/edit`);
    });
  }

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Not published yet — the first publish creates v1.0.</p>;

  return (
    <div className="space-y-4">
      {canCompare && rows.length > 1 && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/50 bg-muted/20 p-3">
          <div className="w-40 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">From</span>
            <OptionSelect value={from} onChange={setFrom} options={options} aria-label="Compare from version" />
          </div>
          <div className="w-40 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">To</span>
            <OptionSelect value={to} onChange={setTo} options={options} aria-label="Compare to version" />
          </div>
          <Link href={`/playbook-ai/library/${sopId}/compare?from=${from}&to=${to}`} className={buttonVariants({ size: "sm" })} aria-disabled={from === to}>
            <GitCompare className="size-3.5" data-icon="inline-start" />
            Compare
          </Link>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Published by</TableHead>
              <TableHead>Date</TableHead>
              {canEdit && <TableHead className="w-28" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.version}>
                <TableCell className="whitespace-nowrap font-semibold">
                  v{r.version} {r.isCurrent && <Badge className="ml-1 bg-green-500/15 text-green-600 dark:text-green-400">Current</Badge>}
                  {r.previousVersion && <span className="block text-[11px] font-normal text-muted-foreground">from v{r.previousVersion}</span>}
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">{r.changeType}</TableCell>
                <TableCell className="max-w-md whitespace-normal">{r.changeSummary}</TableCell>
                <TableCell className="text-muted-foreground">{r.authorName}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.publishedAt)}</TableCell>
                {canEdit && (
                  <TableCell>
                    {!r.isCurrent && (
                      <Button type="button" variant="ghost" size="xs" disabled={pending} onClick={() => load(r.version)} title="Copy this version into the working draft">
                        <History className="size-3" data-icon="inline-start" />
                        Restore
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
