"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  PROJECT_STATUSES,
  PRIORITIES,
  SUPPORTED_CURRENCIES,
  PROJECT_STATUS_TRANSITIONS,
  type ProjectStatus,
} from "@/lib/products/sprintos/constants";
import { saveProjectAction } from "@/app/(products)/sprintos/(protected)/projects/actions";
import type { SerializedProject } from "@/lib/products/sprintos/projects";

const NONE = "__none__";

interface Option {
  _id: string;
  label: string;
  sub?: string;
}

type FormState = Record<string, string>;

function fromProject(p: SerializedProject | undefined, defaults: { clientId?: string; currency: string }): FormState {
  if (!p) {
    return {
      status: "planning",
      priority: "medium",
      currency: defaults.currency,
      progressPercent: "0",
      clientId: defaults.clientId ?? "",
    };
  }
  return {
    name: p.name,
    clientId: p.clientId,
    category: p.category ?? "",
    description: p.description ?? "",
    priority: p.priority,
    status: p.status,
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? "",
    estimatedBudget: p.estimatedBudget != null ? String(p.estimatedBudget) : "",
    estimatedHours: p.estimatedHours != null ? String(p.estimatedHours) : "",
    currency: p.currency,
    projectManagerId: p.projectManagerId ?? "",
    progressPercent: String(p.progressPercent),
  };
}

export default function ProjectForm({
  project,
  clients,
  employees,
  categories,
  technologySuggestions,
  defaultCurrency,
  defaultClientId,
}: {
  project?: SerializedProject;
  clients: Option[];
  employees: Option[];
  categories: string[];
  technologySuggestions: string[];
  defaultCurrency: string;
  defaultClientId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() =>
    fromProject(project, { clientId: defaultClientId, currency: defaultCurrency })
  );
  const [technologies, setTechnologies] = useState<string[]>(project?.technologies ?? []);
  const [techInput, setTechInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  const statusOptions = useMemo(() => {
    if (!project) return PROJECT_STATUSES;
    const allowed = new Set<ProjectStatus>([project.status, ...PROJECT_STATUS_TRANSITIONS[project.status]]);
    return PROJECT_STATUSES.filter((s) => allowed.has(s.value));
  }, [project]);

  function addTech(value: string) {
    const v = value.trim();
    if (v && !technologies.includes(v)) setTechnologies((t) => [...t, v]);
    setTechInput("");
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveProjectAction({ ...form, technologies }, project?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(project ? "Project updated" : "Project created");
      router.push(result.id ? `/sprintos/projects/${result.id}` : "/sprintos/projects");
      router.refresh();
    });
  }

  const techPool = technologySuggestions.filter((s) => !technologies.includes(s)).slice(0, 12);

  return (
    <GlassCard interactive={false}>
      <CardContent className="space-y-4 py-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Project name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
            {err("name")}
          </div>

          <div className="space-y-1.5">
            <Label>Client *</Label>
            <Select value={form.clientId || NONE} onValueChange={(v) => set("clientId", v === NONE ? "" : (v ?? ""))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a client" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Select a client</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c._id} value={c._id}>{c.label}{c.sub ? ` · ${c.sub}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err("clientId")}
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category || NONE} onValueChange={(v) => set("category", v === NONE ? "" : (v ?? ""))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Uncategorised" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Uncategorised</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority || "medium"} onValueChange={(v) => set("priority", v ?? "medium")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status || "planning"} onValueChange={(v) => set("status", v ?? "planning")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err("status")}
          </div>

          <div className="space-y-1.5">
            <Label>Project manager</Label>
            <Select value={form.projectManagerId || NONE} onValueChange={(v) => set("projectManagerId", v === NONE ? "" : (v ?? ""))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e._id} value={e._id}>{e.label}{e.sub ? ` · ${e.sub}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Input type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
            {err("startDate")}
          </div>
          <div className="space-y-1.5">
            <Label>End date</Label>
            <Input type="date" value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} />
            {err("endDate")}
          </div>

          <div className="space-y-1.5">
            <Label>Estimated budget</Label>
            <Input type="number" min={0} value={form.estimatedBudget ?? ""} onChange={(e) => set("estimatedBudget", e.target.value)} />
            {err("estimatedBudget")}
          </div>
          <div className="space-y-1.5">
            <Label>Estimated hours</Label>
            <Input type="number" min={0} value={form.estimatedHours ?? ""} onChange={(e) => set("estimatedHours", e.target.value)} placeholder="Defaults to sum of task estimates" />
            {err("estimatedHours")}
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={form.currency || defaultCurrency} onValueChange={(v) => set("currency", v ?? defaultCurrency)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Progress ({form.progressPercent || 0}%)</Label>
            <Input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.progressPercent || "0"}
              onChange={(e) => set("progressPercent", e.target.value)}
            />
            {err("progressPercent")}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Technology stack</Label>
          <div className="flex flex-wrap gap-1.5">
            {technologies.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {t}
                <button type="button" onClick={() => setTechnologies((prev) => prev.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <Input
            value={techInput}
            onChange={(e) => setTechInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTech(techInput);
              }
            }}
            placeholder="Type a technology and press Enter"
          />
          {techPool.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {techPool.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addTech(s)}
                  className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={4} />
        </div>

        <div className="flex gap-2">
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : project ? "Save changes" : "Create project"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        </div>
      </CardContent>
    </GlassCard>
  );
}
