"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  saveDepartmentAction,
  deleteDepartmentAction,
  saveDesignationAction,
  deleteDesignationAction,
  saveTeamAction,
  deleteTeamAction,
} from "@/app/(products)/talentos/(protected)/(staff)/departments/actions";

interface DeptRow {
  _id: string;
  name: string;
  code: string;
  description: string | null;
  headEmployeeId: string | null;
  employeeCount: number;
  designationCount: number;
  teamCount: number;
}
interface DesigRow {
  _id: string;
  title: string;
  departmentId: string;
  level: string | null;
}
interface TeamRow {
  _id: string;
  name: string;
  departmentId: string;
  leadEmployeeId: string | null;
}

type Kind = "departments" | "designations" | "teams";
const NONE = "__none__";

export default function DepartmentsManager({
  departments,
  designations,
  teams,
  employees,
  canManage,
}: {
  departments: DeptRow[];
  designations: DesigRow[];
  teams: TeamRow[];
  employees: { _id: string; name: string; employeeCode: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Kind>("departments");
  const [pending, startTransition] = useTransition();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<{ kind: Kind; id?: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Record<string, string>>({});

  const deptName = (id: string) => departments.find((d) => d._id === id)?.name ?? "—";
  const empName = (id: string | null) => employees.find((e) => e._id === id)?.name ?? "—";

  function openCreate(kind: Kind) {
    setEditing({ kind });
    setForm({});
    setErrors({});
    setSheetOpen(true);
  }
  function openEdit(kind: Kind, row: DeptRow | DesigRow | TeamRow) {
    setEditing({ kind, id: row._id });
    setErrors({});
    if (kind === "departments") {
      const d = row as DeptRow;
      setForm({ name: d.name, code: d.code, description: d.description ?? "", headEmployeeId: d.headEmployeeId ?? "" });
    } else if (kind === "designations") {
      const d = row as DesigRow;
      setForm({ title: d.title, departmentId: d.departmentId, level: d.level ?? "" });
    } else {
      const t = row as TeamRow;
      setForm({ name: t.name, departmentId: t.departmentId, leadEmployeeId: t.leadEmployeeId ?? "" });
    }
    setSheetOpen(true);
  }

  function submit() {
    if (!editing) return;
    setErrors({});
    startTransition(async () => {
      const { kind, id } = editing;
      const action =
        kind === "departments" ? saveDepartmentAction : kind === "designations" ? saveDesignationAction : saveTeamAction;
      const result = await action(form, id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Saved");
      setSheetOpen(false);
      router.refresh();
    });
  }

  function remove(kind: Kind, id: string) {
    startTransition(async () => {
      const action =
        kind === "departments" ? deleteDepartmentAction : kind === "designations" ? deleteDesignationAction : deleteTeamAction;
      const result = await action(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete.");
        return;
      }
      toast.success("Deleted");
      router.refresh();
    });
  }

  const tabs: { key: Kind; label: string; count: number }[] = [
    { key: "departments", label: "Departments", count: departments.length },
    { key: "designations", label: "Designations", count: designations.length },
    { key: "teams", label: "Teams", count: teams.length },
  ];

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelTabs active={tab} onSelect={(k) => setTab(k as Kind)} tabs={tabs.map((t) => ({ key: t.key, label: t.label, count: t.count }))} />
        {canManage && (
          <Button type="button" size="sm" onClick={() => openCreate(tab)}>
            <Plus className="size-3.5" data-icon="inline-start" />
            New {tab === "departments" ? "Department" : tab === "designations" ? "Designation" : "Team"}
          </Button>
        )}
      </div>

      <GlassCard interactive={false}>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              {tab === "departments" && (
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Head</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Designations</TableHead>
                  <TableHead>Teams</TableHead>
                  {canManage && <TableHead className="w-20" />}
                </TableRow>
              )}
              {tab === "designations" && (
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Level</TableHead>
                  {canManage && <TableHead className="w-20" />}
                </TableRow>
              )}
              {tab === "teams" && (
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Team Lead</TableHead>
                  {canManage && <TableHead className="w-20" />}
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {tab === "departments" &&
                departments.map((d) => (
                  <TableRow key={d._id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{d.code}</TableCell>
                    <TableCell className="text-muted-foreground">{empName(d.headEmployeeId)}</TableCell>
                    <TableCell>{d.employeeCount}</TableCell>
                    <TableCell>{d.designationCount}</TableCell>
                    <TableCell>{d.teamCount}</TableCell>
                    {canManage && (
                      <TableCell>
                        <RowActions onEdit={() => openEdit("departments", d)} onDelete={() => remove("departments", d._id)} label={d.name} pending={pending} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              {tab === "designations" &&
                designations.map((d) => (
                  <TableRow key={d._id}>
                    <TableCell className="font-medium">{d.title}</TableCell>
                    <TableCell className="text-muted-foreground">{deptName(d.departmentId)}</TableCell>
                    <TableCell className="text-muted-foreground">{d.level ?? "—"}</TableCell>
                    {canManage && (
                      <TableCell>
                        <RowActions onEdit={() => openEdit("designations", d)} onDelete={() => remove("designations", d._id)} label={d.title} pending={pending} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              {tab === "teams" &&
                teams.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground">{deptName(t.departmentId)}</TableCell>
                    <TableCell className="text-muted-foreground">{empName(t.leadEmployeeId)}</TableCell>
                    {canManage && (
                      <TableCell>
                        <RowActions onEdit={() => openEdit("teams", t)} onDelete={() => remove("teams", t._id)} label={t.name} pending={pending} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              {((tab === "departments" && departments.length === 0) ||
                (tab === "designations" && designations.length === 0) ||
                (tab === "teams" && teams.length === 0)) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nothing here yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>
              {editing?.id ? "Edit" : "New"}{" "}
              {editing?.kind === "departments" ? "Department" : editing?.kind === "designations" ? "Designation" : "Team"}
            </SheetTitle>
            <SheetDescription>Master data used across the TalentOS.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {editing?.kind === "departments" && (
              <>
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  {err("name")}
                </div>
                <div className="space-y-1.5">
                  <Label>Code *</Label>
                  <Input value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="ENG" />
                  {err("code")}
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Department head</Label>
                  <EmployeeSelect value={form.headEmployeeId ?? ""} employees={employees} onChange={(v) => setForm((f) => ({ ...f, headEmployeeId: v }))} />
                </div>
              </>
            )}

            {editing?.kind === "designations" && (
              <>
                <div className="space-y-1.5">
                  <Label>Title *</Label>
                  <Input value={form.title ?? ""} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                  {err("title")}
                </div>
                <div className="space-y-1.5">
                  <Label>Department *</Label>
                  <Select value={form.departmentId || NONE} onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v === NONE ? "" : (v ?? "") }))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select a department" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select a department</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {err("departmentId")}
                </div>
                <div className="space-y-1.5">
                  <Label>Level</Label>
                  <Input value={form.level ?? ""} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} placeholder="e.g. L3 / Senior" />
                </div>
              </>
            )}

            {editing?.kind === "teams" && (
              <>
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  {err("name")}
                </div>
                <div className="space-y-1.5">
                  <Label>Department *</Label>
                  <Select value={form.departmentId || NONE} onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v === NONE ? "" : (v ?? "") }))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select a department" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select a department</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {err("departmentId")}
                </div>
                <div className="space-y-1.5">
                  <Label>Team lead</Label>
                  <EmployeeSelect value={form.leadEmployeeId ?? ""} employees={employees} onChange={(v) => setForm((f) => ({ ...f, leadEmployeeId: v }))} />
                </div>
              </>
            )}

            <Button type="button" onClick={submit} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EmployeeSelect({
  value,
  employees,
  onChange,
}: {
  value: string;
  employees: { _id: string; name: string; employeeCode: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : (v ?? ""))}>
      <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {employees.map((e) => (
          <SelectItem key={e._id} value={e._id}>{e.name} · {e.employeeCode}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RowActions({ onEdit, onDelete, label, pending }: { onEdit: () => void; onDelete: () => void; label: string; pending: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${label}`}>
        <Pencil className="size-3.5" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${label}`} disabled={pending}>
              <Trash2 className="size-3.5" />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is blocked if any employee still references it. Otherwise it is soft-deleted and kept for audit history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
