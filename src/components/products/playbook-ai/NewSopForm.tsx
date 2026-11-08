"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { createSopAction } from "@/app/(products)/playbook-ai/(protected)/actions";

/** Start an SOP: pick department + template, name it, and land in the editor with a draft already created. */
export default function NewSopForm({
  departments,
  templates,
  functions,
  processes,
  categories,
  defaultDepartmentId,
}: {
  departments: { id: string; name: string; code: string }[];
  templates: { id: string; name: string; description: string; departmentCodes: string[]; sectionCount: number }[];
  functions: { id: string; departmentId: string; name: string }[];
  processes: { id: string; functionId: string; parentId: string | null; name: string }[];
  categories: { id: string; name: string }[];
  defaultDepartmentId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId);
  const [templateId, setTemplateId] = useState("");
  const [templateTouched, setTemplateTouched] = useState(false);
  const [functionId, setFunctionId] = useState("");
  const [processId, setProcessId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dept = departments.find((d) => d.id === departmentId);
  // Until the user picks a template themselves, follow the department: its matching family, else the general one.
  const suggested = useMemo(
    () => templates.find((t) => dept && t.departmentCodes.includes(dept.code))?.id ?? templates.find((t) => t.departmentCodes.length === 0)?.id ?? "",
    [templates, dept]
  );
  const effectiveTemplate = templateTouched ? templateId : suggested;
  const template = templates.find((t) => t.id === effectiveTemplate);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createSopAction({ title, departmentId, templateId: effectiveTemplate || null, functionId: functionId || null, processId: processId || null, categoryId: categoryId || null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(`Draft ${res.code} created`);
      router.push(`/playbook-ai/library/${res.id}/edit`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="new-title">Title</Label>
        <Input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus placeholder="e.g. Employee Onboarding Procedure" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Department</Label>
          <OptionSelect
            value={departmentId}
            onChange={(v) => {
              setDepartmentId(v);
              setFunctionId("");
              setProcessId("");
            }}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
            placeholder="Choose a department"
            aria-label="Department"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Template</Label>
          <OptionSelect
            value={effectiveTemplate}
            onChange={(v) => {
              setTemplateId(v);
              setTemplateTouched(true);
            }}
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
            noneLabel="Blank (no sections)"
            aria-label="Template"
          />
          {template && <p className="text-[11px] text-muted-foreground">{template.description} · {template.sectionCount} sections</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Function (optional)</Label>
          <OptionSelect
            value={functionId}
            onChange={(v) => {
              setFunctionId(v);
              setProcessId("");
            }}
            options={functions.filter((f) => f.departmentId === departmentId).map((f) => ({ value: f.id, label: f.name }))}
            noneLabel="None"
            aria-label="Function"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Process (optional)</Label>
          <OptionSelect value={processId} onChange={setProcessId} options={processes.filter((p) => !p.parentId && p.functionId === functionId).map((p) => ({ value: p.id, label: p.name }))} noneLabel="None" disabled={!functionId} aria-label="Process" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Category (optional)</Label>
          <OptionSelect value={categoryId} onChange={setCategoryId} options={categories.map((c) => ({ value: c.id, label: c.name }))} noneLabel="Uncategorised" aria-label="Category" />
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || !title.trim() || !departmentId}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" data-icon="inline-start" />}
        Create draft & open editor
      </Button>
    </form>
  );
}
