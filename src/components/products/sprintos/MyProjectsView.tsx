"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useState } from "react";
import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ProjectStatusBadge, PriorityBadge, ProjectHealthBadge } from "@/components/products/sprintos/StatusBadges";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { PROJECT_STATUSES, type ProjectHealth } from "@/lib/products/sprintos/constants";
import { cn, formatDate } from "@/lib/utils";
import type { EmployeeProjectRow } from "@/lib/products/sprintos/employee-dashboard";

export default function MyProjectsView({ projects }: { projects: EmployeeProjectRow[] }) {
  const [view, setView] = useState<"list" | "board">("list");

  return (
    <div className="space-y-4">
      <PanelTabs label="View" active={view} onSelect={(k) => setView(k as typeof view)} tabs={[{ key: "list", label: "List", icon: <List className="size-3.5" /> }, { key: "board", label: "Board", icon: <LayoutGrid className="size-3.5" /> }]} />

      {view === "list" ? (
        <GlassCard interactive={false}>
          <CardContent className="max-h-[65vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                  <TableHead>My Hours</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No projects assigned.</TableCell></TableRow>
                )}
                {projects.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell>
                      <Link href={`/sprintos/projects/${p._id}`} className="font-medium hover:underline">{p.name}</Link>
                      <div className="font-mono text-xs text-muted-foreground">{p.projectCode}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.clientName}</TableCell>
                    <TableCell className="text-muted-foreground">{p.managerName}</TableCell>
                    <TableCell><PriorityBadge priority={p.priority} /></TableCell>
                    <TableCell><ProjectStatusBadge status={p.status} /></TableCell>
                    <TableCell><ProjectHealthBadge health={p.health as ProjectHealth} /></TableCell>
                    <TableCell><ProgressBar value={p.progressPercent} /></TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {p.myLoggedHours}h{p.remainingHours != null ? ` / ${p.remainingHours}h left` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.endDate ? formatDate(p.endDate) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </GlassCard>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {PROJECT_STATUSES.map((s) => {
            const col = projects.filter((p) => p.status === s.value);
            return (
              <div key={s.value} className="flex w-72 shrink-0 flex-col rounded-2xl border border-border/50 bg-muted/30 p-2">
                <div className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-foreground">
                  <span className={`size-2 rounded-full ${s.dotClass}`} />
                  {s.label}
                  <span className="text-xs font-normal text-muted-foreground">{col.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {col.map((p) => (
                    <Link
                      key={p._id}
                      href={`/sprintos/projects/${p._id}`}
                      className="rounded-xl border border-border/60 bg-background/95 p-2.5 text-sm dark:bg-card/80"
                    >
                      <p className="font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.clientName} · {p.myLoggedHours}h</p>
                      <ProgressBar value={p.progressPercent} className="mt-2" showLabel={false} />
                    </Link>
                  ))}
                  {col.length === 0 && <p className="px-1 py-3 text-center text-xs text-muted-foreground">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
