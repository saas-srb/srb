"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  WORK_LOCATIONS,
  DEFAULT_EMPLOYEE_STATUS,
} from "@/lib/products/talentos/employee-status";
import { createEmployeeAction, updateEmployeeAction, type EmployeeActionResult } from "@/app/(products)/talentos/(protected)/(staff)/employees/actions";
import type { SerializedEmployee } from "@/lib/products/talentos/employees";

type Option = { _id: string; name?: string; title?: string; label?: string };

interface EmployeeFormProps {
  mode: "create" | "edit";
  employee?: SerializedEmployee;
  departments: { _id: string; name: string }[];
  designations: { _id: string; title: string; departmentId: string }[];
  teams: { _id: string; name: string; departmentId: string }[];
  managers: { _id: string; name: string; employeeCode: string }[];
  prefill?: {
    applicationId: string;
    firstName: string;
    lastName: string;
    personalEmail: string;
    phone: string;
    positionTitle: string;
  } | null;
}

const NONE = "__none__";

export default function EmployeeForm({ mode, employee, departments, designations, teams, managers, prefill }: EmployeeFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const p = employee?.personal;
  const pr = employee?.professional;

  const [form, setForm] = useState({
    firstName: employee?.firstName ?? prefill?.firstName ?? "",
    lastName: employee?.lastName ?? prefill?.lastName ?? "",
    workEmail: employee?.workEmail ?? "",
    status: employee?.status ?? DEFAULT_EMPLOYEE_STATUS,
    // personal
    dateOfBirth: p?.dateOfBirth ?? "",
    gender: p?.gender ?? "",
    maritalStatus: p?.maritalStatus ?? "",
    personalEmail: p?.personalEmail ?? prefill?.personalEmail ?? "",
    phone: p?.phone ?? prefill?.phone ?? "",
    addressLine: p?.addressLine ?? "",
    city: p?.city ?? "",
    state: p?.state ?? "",
    postalCode: p?.postalCode ?? "",
    // professional
    departmentId: pr?.departmentId ?? "",
    designationId: pr?.designationId ?? "",
    teamId: pr?.teamId ?? "",
    reportingManagerId: pr?.reportingManagerId ?? "",
    employmentType: pr?.employmentType ?? "",
    workLocation: pr?.workLocation ?? "",
    joiningDate: pr?.joiningDate ?? "",
    probationEndDate: pr?.probationEndDate ?? "",
    relievingDate: pr?.relievingDate ?? "",
  });

  const [contacts, setContacts] = useState(
    employee?.emergencyContacts?.length ? employee.emergencyContacts : [{ name: "", relationship: "", phone: "" }]
  );

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const filteredDesignations = form.departmentId ? designations.filter((d) => d.departmentId === form.departmentId) : designations;
  const filteredTeams = form.departmentId ? teams.filter((t) => t.departmentId === form.departmentId) : teams;

  function buildPayload() {
    return {
      firstName: form.firstName,
      lastName: form.lastName,
      workEmail: form.workEmail,
      status: form.status,
      dateOfBirth: form.dateOfBirth,
      gender: form.gender,
      maritalStatus: form.maritalStatus,
      personalEmail: form.personalEmail,
      phone: form.phone,
      addressLine: form.addressLine,
      city: form.city,
      state: form.state,
      postalCode: form.postalCode,
      departmentId: form.departmentId,
      designationId: form.designationId,
      teamId: form.teamId,
      reportingManagerId: form.reportingManagerId,
      employmentType: form.employmentType,
      workLocation: form.workLocation,
      joiningDate: form.joiningDate,
      probationEndDate: form.probationEndDate,
      relievingDate: form.relievingDate,
      emergencyContacts: contacts.filter((c) => c.name.trim() && c.phone.trim()),
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      let result: EmployeeActionResult;
      if (mode === "create") {
        result = await createEmployeeAction(buildPayload(), prefill?.applicationId);
      } else {
        result = await updateEmployeeAction(employee!._id, buildPayload());
      }
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(mode === "create" ? "Employee created" : "Employee updated");
      router.push(`/talentos/employees/${result.id}`);
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {prefill && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
          Converting applicant for <span className="font-medium">{prefill.positionTitle}</span>. Recruitment history will be linked to this employee.
        </div>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>First name *</Label>
            <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} aria-invalid={!!errors.firstName || undefined} />
            {err("firstName")}
          </div>
          <div className="space-y-1.5">
            <Label>Last name *</Label>
            <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} aria-invalid={!!errors.lastName || undefined} />
            {err("lastName")}
          </div>
          <div className="space-y-1.5">
            <Label>Work email *</Label>
            <Input type="email" value={form.workEmail} onChange={(e) => set("workEmail", e.target.value)} aria-invalid={!!errors.workEmail || undefined} />
            {err("workEmail")}
          </div>
          <div className="space-y-1.5">
            <Label>Employment status</Label>
            <Select value={form.status} onValueChange={(v) => v && set("status", v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYEE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Personal Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
            {err("dateOfBirth")}
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={form.gender || NONE} onValueChange={(v) => set("gender", v === NONE ? "" : (v ?? ""))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {GENDERS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Marital status</Label>
            <Input value={form.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Personal email</Label>
            <Input type="email" value={form.personalEmail} onChange={(e) => set("personalEmail", e.target.value)} aria-invalid={!!errors.personalEmail || undefined} />
            {err("personalEmail")}
          </div>
          <div className="space-y-1.5">
            <Label>Personal phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!errors.phone || undefined} />
            {err("phone")}
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.addressLine} onChange={(e) => set("addressLine", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input value={form.state} onChange={(e) => set("state", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Postal code</Label>
            <Input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Professional Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select
              value={form.departmentId || NONE}
              onValueChange={(v) => {
                const next = v === NONE ? "" : (v ?? "");
                setForm((f) => ({ ...f, departmentId: next, designationId: "", teamId: "" }));
              }}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Designation</Label>
            <Select value={form.designationId || NONE} onValueChange={(v) => set("designationId", v === NONE ? "" : (v ?? ""))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {filteredDesignations.map((d) => (
                  <SelectItem key={d._id} value={d._id}>{d.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Team</Label>
            <Select value={form.teamId || NONE} onValueChange={(v) => set("teamId", v === NONE ? "" : (v ?? ""))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {filteredTeams.map((t) => (
                  <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reporting manager</Label>
            <Select value={form.reportingManagerId || NONE} onValueChange={(v) => set("reportingManagerId", v === NONE ? "" : (v ?? ""))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {managers
                  .filter((m) => m._id !== employee?._id)
                  .map((m) => (
                    <SelectItem key={m._id} value={m._id}>{m.name} · {m.employeeCode}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {err("reportingManagerId")}
          </div>
          <div className="space-y-1.5">
            <Label>Employment type</Label>
            <Select value={form.employmentType || NONE} onValueChange={(v) => set("employmentType", v === NONE ? "" : (v ?? ""))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {EMPLOYMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Work location</Label>
            <Select value={form.workLocation || NONE} onValueChange={(v) => set("workLocation", v === NONE ? "" : (v ?? ""))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {WORK_LOCATIONS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Joining date</Label>
            <Input type="date" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} />
            {err("joiningDate")}
          </div>
          <div className="space-y-1.5">
            <Label>Probation end date</Label>
            <Input type="date" value={form.probationEndDate} onChange={(e) => set("probationEndDate", e.target.value)} />
            {err("probationEndDate")}
          </div>
          <div className="space-y-1.5">
            <Label>Relieving date</Label>
            <Input type="date" value={form.relievingDate} onChange={(e) => set("relievingDate", e.target.value)} />
            {err("relievingDate")}
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Emergency Contacts</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {contacts.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input placeholder="Name" value={c.name} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input placeholder="Relationship" value={c.relationship} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)))} />
              <Input placeholder="Phone" value={c.phone} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setContacts((cs) => (cs.length > 1 ? cs.filter((_, j) => j !== i) : cs))}
                aria-label="Remove contact"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setContacts((cs) => [...cs, { name: "", relationship: "", phone: "" }])}>
            <Plus className="size-3.5" data-icon="inline-start" />
            Add contact
          </Button>
        </CardContent>
      </GlassCard>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : mode === "create" ? "Create Employee" : "Save Changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export type { Option };
