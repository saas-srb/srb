"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ListChecks, RotateCcw } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TaskStatusBadge, PriorityBadge } from "@/components/products/sprintos/StatusBadges";
import { TASK_STATUSES, PRIORITIES } from "@/lib/products/sprintos/constants";
import { formatDate, cn } from "@/lib/utils";
import type { SerializedTask } from "@/lib/products/sprintos/tasks";

interface Row extends SerializedTask {
  assigneeName: string | null;
  subtaskCount: number;
}

export default function TaskList({
  projectId,
  tasks,
  labels,
}: {
  projectId: string;
  tasks: Row[];
  labels: string[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [label, setLabel] = useState("all");
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (label !== "all" && !t.labels.includes(label)) return false;
      if (q && !`${t.title} ${t.taskCode}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, search, status, priority, label]);

  const hasFilters = search || status !== "all" || priority !== "all" || label !== "all";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <ListChecks className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
              <p className="text-xs text-muted-foreground">Search and filter tasks in this project</p>
            </div>
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setSearch(""); setStatus("all"); setPriority("all"); setLabel("all"); }}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-all"
            >
              <RotateCcw className="size-3.5" />
              Reset Filters
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title or code" className="h-9 w-52 pl-8 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v ?? "all")}>
              <SelectTrigger className="w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Priority</label>
            <Select value={priority} onValueChange={(v) => setPriority(v ?? "all")}>
              <SelectTrigger className="w-32 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any priority</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {labels.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Label</label>
              <Select value={label} onValueChange={(v) => setLabel(v ?? "all")}>
                <SelectTrigger className="w-40 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any label</SelectItem>
                  {labels.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No tasks match these filters.</TableCell>
                </TableRow>
              )}
              {filtered.map((t) => (
                <TableRow key={t._id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{t.taskCode}</TableCell>
                  <TableCell>
                    <Link href={`/sprintos/projects/${projectId}/tasks/${t._id}`} className="font-medium hover:underline">{t.title}</Link>
                    {t.subtaskCount > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({t.subtaskCount} subtask{t.subtaskCount === 1 ? "" : "s"})</span>}
                    {t.labels.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {t.labels.map((l) => (
                          <span key={l} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{l}</span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.assigneeName ?? "—"}</TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell><TaskStatusBadge status={t.status} /></TableCell>
                  <TableCell className={cn("text-muted-foreground", t.dueDate && t.dueDate < today && t.status !== "done" && "font-medium text-destructive")}>
                    {t.dueDate ? formatDate(t.dueDate) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}
