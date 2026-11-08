"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, List, Search } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TaskStatusBadge, PriorityBadge } from "@/components/products/sprintos/StatusBadges";
import { TASK_STATUSES } from "@/lib/products/sprintos/constants";
import { cn, formatDate } from "@/lib/utils";

export interface MyTaskRow {
  _id: string;
  taskCode: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  projectCode: string;
}

export default function MyTasksView({ tasks, projects }: { tasks: MyTaskRow[]; projects: { _id: string; name: string }[] }) {
  const [view, setView] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("all");
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (project !== "all" && t.projectId !== project) return false;
      if (q && !`${t.title} ${t.taskCode} ${t.projectName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, search, project]);

  return (
    <div className="space-y-4">
      <GlassCard interactive={false}>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <PanelTabs label="View" active={view} onSelect={(k) => setView(k as typeof view)} tabs={[{ key: "list", label: "List", icon: <List className="size-3.5" /> }, { key: "board", label: "Board", icon: <LayoutGrid className="size-3.5" /> }]} />
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" className="h-8 w-52 rounded-xl border-border/50 bg-background pl-8 text-xs placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/50" />
            </div>
            <Select value={project} onValueChange={(v) => setProject(v ?? "all")}>
              <SelectTrigger className="h-8 w-48 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </GlassCard>

      {view === "list" ? (
        <GlassCard interactive={false}>
          <CardContent className="max-h-[62vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No tasks.</TableCell></TableRow>
                )}
                {filtered.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.taskCode}</TableCell>
                    <TableCell>
                      <Link href={`/sprintos/projects/${t.projectId}/tasks/${t._id}`} className="font-medium hover:underline">{t.title}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.projectName}</TableCell>
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
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {TASK_STATUSES.map((s) => {
            const col = filtered.filter((t) => t.status === s.value);
            return (
              <div key={s.value} className="flex w-72 shrink-0 flex-col rounded-2xl border border-border/50 bg-muted/30 p-2">
                <div className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-foreground">
                  <span className={`size-2 rounded-full ${s.dotClass}`} />
                  {s.label}
                  <span className="text-xs font-normal text-muted-foreground">{col.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {col.map((t) => (
                    <Link key={t._id} href={`/sprintos/projects/${t.projectId}/tasks/${t._id}`} className="rounded-xl border border-border/60 bg-background/95 p-2.5 text-sm dark:bg-card/80">
                      <p className="font-medium text-foreground">{t.title}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">{t.taskCode}</span>
                        <PriorityBadge priority={t.priority} />
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{t.projectName}</p>
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
