"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, Link2, Link2Off, Pencil, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import ConfirmDelete from "@/components/products/playbook-ai/ConfirmDelete";
import {
  deleteDepartmentAction,
  deleteFunctionAction,
  deleteProcessAction,
  saveDepartmentAction,
  saveFunctionAction,
  saveProcessAction,
} from "@/app/(products)/playbook-ai/(protected)/actions";
import { cn } from "@/lib/utils";

export interface DeptNode {
  id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  hrmsDepartmentId: string | null;
  hrmsName: string | null;
  counts: { live: number; draft: number; total: number };
  functions: {
    id: string;
    name: string;
    description: string;
    active: boolean;
    processes: { id: string; name: string; active: boolean; subs: { id: string; name: string; active: boolean }[] }[];
  }[];
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? null : <Badge className="bg-muted text-muted-foreground">Inactive</Badge>;
}

/** Department → Function → Process → Sub-process browser. Anyone can browse; MANAGE_TEMPLATES holders can edit (the server re-checks). */
export default function DepartmentsManager({ nodes, hrmsOptions, canManage }: { nodes: DeptNode[]; hrmsOptions: { value: string; label: string }[]; canManage: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return nodes;
    return nodes.filter(
      (d) =>
        `${d.name} ${d.code}`.toLowerCase().includes(s) ||
        d.functions.some((f) => f.name.toLowerCase().includes(s) || f.processes.some((p) => p.name.toLowerCase().includes(s) || p.subs.some((x) => x.name.toLowerCase().includes(s))))
    );
  }, [nodes, q]);

  const deptFields = [
    { key: "name", label: "Name", type: "text" as const, maxLength: 80 },
    { key: "description", label: "Description", type: "textarea" as const },
    { key: "hrmsDepartmentId", label: "Linked TalentOS department", type: "select" as const, options: hrmsOptions, noneLabel: "Not linked", hint: "The link is how TalentOS membership drives who can read department-only SOPs and who mandatory SOPs are assigned to." },
    { key: "active", label: "Active (available for new SOPs)", type: "checkbox" as const },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search departments, functions, processes" className="h-9 w-72 rounded-xl pl-8" aria-label="Search structure" />
        </div>
        {canManage && (
          <EditDialog
            trigger={<Button type="button" size="sm"><Plus className="size-3.5" data-icon="inline-start" />Add department</Button>}
            title="Add a department"
            description="Departments added in TalentOS appear here automatically. Use this for departments that don't exist in TalentOS."
            fields={[{ key: "name", label: "Name", type: "text", maxLength: 80 }, { key: "code", label: "Code (used in SOP IDs)", type: "text", maxLength: 8, hint: "Optional — generated from the name if blank." }, { key: "description", label: "Description", type: "textarea" }, { key: "hrmsDepartmentId", label: "Linked TalentOS department", type: "select", options: hrmsOptions, noneLabel: "Not linked" }]}
            initial={{ name: "", code: "", description: "", hrmsDepartmentId: "" }}
            onSubmit={(v) => saveDepartmentAction({ name: String(v.name), code: String(v.code), description: String(v.description), hrmsDepartmentId: String(v.hrmsDepartmentId) || null })}
          />
        )}
      </div>

      {filtered.length === 0 && <p className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">No departments match.</p>}

      <div className="grid gap-3">
        {filtered.map((d) => {
          const isOpen = open[d.id] ?? q.trim().length > 0;
          return (
            <div key={d.id} className="lms-surface rounded-2xl border border-border/40 bg-background/95 dark:bg-card/85">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [d.id]: !isOpen }))} aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${d.name}`} className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                  <ChevronDown className={cn("size-4 transition-transform", !isOpen && "-rotate-90")} />
                </button>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {d.name}
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{d.code}</span>
                    <ActiveBadge active={d.active} />
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {d.hrmsDepartmentId ? <><Link2 className="size-3" />TalentOS: {d.hrmsName ?? "linked"}</> : <><Link2Off className="size-3" />Not linked to an TalentOS department</>}
                    <span>· {d.functions.length} function{d.functions.length === 1 ? "" : "s"}</span>
                  </p>
                </div>
                <Link href={`/playbook-ai/library?department=${d.id}`} className="text-xs font-medium text-primary hover:underline">
                  {d.counts.live} live · {d.counts.draft} draft · View SOPs
                </Link>
                {canManage && (
                  <span className="flex items-center gap-0.5">
                    <EditDialog
                      trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Edit ${d.name}`}><Pencil /></Button>}
                      title={`Edit ${d.name}`}
                      fields={deptFields}
                      initial={{ name: d.name, description: d.description, hrmsDepartmentId: d.hrmsDepartmentId ?? "", active: d.active }}
                      onSubmit={(v) => saveDepartmentAction({ id: d.id, name: String(v.name), description: String(v.description), hrmsDepartmentId: String(v.hrmsDepartmentId) || null, active: !!v.active })}
                    />
                    <ConfirmDelete label={`Delete ${d.name}`} what={`the ${d.name} department`} action={() => deleteDepartmentAction(d.id)} />
                  </span>
                )}
              </div>

              {isOpen && (
                <div className="space-y-2 border-t border-border/40 px-4 py-3 sm:pl-16">
                  {d.functions.length === 0 && <p className="text-xs text-muted-foreground">No functions yet.</p>}
                  {d.functions.map((f) => (
                    <div key={f.id} className="rounded-xl border border-border/40 p-3">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 text-sm font-medium">{f.name} <ActiveBadge active={f.active} /></p>
                        {canManage && (
                          <span className="flex items-center gap-0.5">
                            <EditDialog
                              trigger={<Button type="button" variant="ghost" size="xs"><Plus data-icon="inline-start" />Process</Button>}
                              title={`Add a process to ${f.name}`}
                              fields={[{ key: "name", label: "Process name", type: "text", maxLength: 120 }]}
                              initial={{ name: "" }}
                              onSubmit={(v) => saveProcessAction({ functionId: f.id, name: String(v.name) })}
                            />
                            <EditDialog
                              trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Edit ${f.name}`}><Pencil /></Button>}
                              title={`Edit function`}
                              fields={[{ key: "name", label: "Name", type: "text", maxLength: 100 }, { key: "description", label: "Description", type: "textarea" }, { key: "active", label: "Active", type: "checkbox" }]}
                              initial={{ name: f.name, description: f.description, active: f.active }}
                              onSubmit={(v) => saveFunctionAction({ id: f.id, departmentId: d.id, name: String(v.name), description: String(v.description), active: !!v.active })}
                            />
                            <ConfirmDelete label={`Delete ${f.name}`} what={`the ${f.name} function`} action={() => deleteFunctionAction(f.id)} />
                          </span>
                        )}
                      </div>
                      {f.processes.length > 0 && (
                        <ul className="mt-2 space-y-1 border-l border-border/60 pl-3">
                          {f.processes.map((p) => (
                            <li key={p.id}>
                              <div className="flex items-center gap-2 text-sm">
                                <Link href={`/playbook-ai/library?process=${p.id}`} className="min-w-0 flex-1 truncate hover:text-primary hover:underline">{p.name}</Link>
                                <ActiveBadge active={p.active} />
                                {canManage && (
                                  <span className="flex items-center gap-0.5">
                                    <EditDialog
                                      trigger={<Button type="button" variant="ghost" size="xs"><Plus data-icon="inline-start" />Sub</Button>}
                                      title={`Add a sub-process to ${p.name}`}
                                      fields={[{ key: "name", label: "Sub-process name", type: "text", maxLength: 120 }]}
                                      initial={{ name: "" }}
                                      onSubmit={(v) => saveProcessAction({ functionId: f.id, parentId: p.id, name: String(v.name) })}
                                    />
                                    <EditDialog
                                      trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Edit ${p.name}`}><Pencil /></Button>}
                                      title="Edit process"
                                      fields={[{ key: "name", label: "Name", type: "text", maxLength: 120 }, { key: "active", label: "Active", type: "checkbox" }]}
                                      initial={{ name: p.name, active: p.active }}
                                      onSubmit={(v) => saveProcessAction({ id: p.id, functionId: f.id, name: String(v.name), active: !!v.active })}
                                    />
                                    <ConfirmDelete label={`Delete ${p.name}`} what={`the ${p.name} process`} action={() => deleteProcessAction(p.id)} />
                                  </span>
                                )}
                              </div>
                              {p.subs.length > 0 && (
                                <ul className="mt-1 space-y-0.5 border-l border-border/40 pl-3">
                                  {p.subs.map((s) => (
                                    <li key={s.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Link href={`/playbook-ai/library?process=${s.id}`} className="min-w-0 flex-1 truncate hover:text-primary hover:underline">{s.name}</Link>
                                      <ActiveBadge active={s.active} />
                                      {canManage && (
                                        <span className="flex items-center gap-0.5">
                                          <EditDialog
                                            trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Edit ${s.name}`}><Pencil /></Button>}
                                            title="Edit sub-process"
                                            fields={[{ key: "name", label: "Name", type: "text", maxLength: 120 }, { key: "active", label: "Active", type: "checkbox" }]}
                                            initial={{ name: s.name, active: s.active }}
                                            onSubmit={(v) => saveProcessAction({ id: s.id, functionId: f.id, name: String(v.name), active: !!v.active })}
                                          />
                                          <ConfirmDelete label={`Delete ${s.name}`} what={`the ${s.name} sub-process`} action={() => deleteProcessAction(s.id)} />
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  {canManage && (
                    <EditDialog
                      trigger={<Button type="button" variant="outline" size="xs"><Plus data-icon="inline-start" />Add function</Button>}
                      title={`Add a function to ${d.name}`}
                      fields={[{ key: "name", label: "Function name", type: "text", maxLength: 100 }, { key: "description", label: "Description", type: "textarea" }]}
                      initial={{ name: "", description: "" }}
                      onSubmit={(v) => saveFunctionAction({ departmentId: d.id, name: String(v.name), description: String(v.description) })}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
