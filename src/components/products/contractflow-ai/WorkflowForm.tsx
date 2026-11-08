"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Trash2, GitBranch } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { createWorkflowAction, updateWorkflowAction } from "@/app/(products)/contractflow-ai/(protected)/actions";

interface WorkflowFormProps {
  workflow?: any;
}

export default function WorkflowForm({ workflow }: WorkflowFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [isDefault, setIsDefault] = useState(workflow?.isDefault ?? false);
  const [steps, setSteps] = useState<any[]>(
    workflow?.steps ?? [
      { id: "step_1", label: "Manager Review", role: "lpms_manager", order: 1 },
      { id: "step_2", label: "Legal Approval", role: "lpms_admin", order: 2 },
    ]
  );

  const handleAddStep = () => {
    setSteps([
      ...steps,
      {
        id: `step_${Date.now()}`,
        label: `Step ${steps.length + 1}`,
        role: "lpms_manager",
        order: steps.length + 1,
      },
    ]);
  };

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleStepChange = (index: number, key: string, value: any) => {
    const next = [...steps];
    next[index] = { ...next[index], [key]: value };
    setSteps(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Workflow name is required.");
      return;
    }

    startTransition(async () => {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        isDefault,
        steps,
      };

      let res;
      if (workflow && workflow.id) {
        res = await updateWorkflowAction(workflow.id, payload);
      } else {
        res = await createWorkflowAction(payload);
      }

      if (res.ok) {
        router.push("/contractflow-ai/workflows");
        router.refresh();
      } else {
        setError(res.error || "Failed to save workflow.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
          {error}
        </div>
      )}

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Workflow Information</CardTitle>
          <CardDescription className="text-xs">
            Set the workflow name, description and default status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              Workflow Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Standard Executive Legal Approval"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Explain the approval process and routing criteria..."
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-border"
            />
            Make this the default workflow for new documents
          </label>
        </CardContent>
      </GlassCard>

      {/* Steps Configurator */}
      <GlassCard interactive={false}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm font-bold">Approval Steps</CardTitle>
            <CardDescription className="text-xs">
              Sequential review steps documents pass through.
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={handleAddStep}
            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Plus className="size-3" />
            Add Step
          </button>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No approval steps configured. Click "Add Step" to define one.
            </p>
          ) : (
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 p-3 text-xs"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                    {idx + 1}
                  </span>
                  <div className="min-w-36 flex-1">
                    <label className="mb-1 block font-medium text-muted-foreground">Step Label</label>
                    <input
                      value={step.label}
                      onChange={(e) => handleStepChange(idx, "label", e.target.value)}
                      className="w-full rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div className="w-36">
                    <label className="mb-1 block font-medium text-muted-foreground">Required Role</label>
                    <select
                      value={step.role}
                      onChange={(e) => handleStepChange(idx, "role", e.target.value)}
                      className="w-full rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="lpms_manager">ContractFlow Manager</option>
                      <option value="lpms_admin">ContractFlow Admin</option>
                      <option value="lpms_author">ContractFlow Author</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveStep(idx)}
                    className="ml-2 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </GlassCard>

      <div className="flex justify-end gap-2">
        <Link href="/contractflow-ai/workflows" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className={buttonVariants({ size: "sm" })}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : workflow ? (
            "Save Workflow"
          ) : (
            "Create Workflow"
          )}
        </button>
      </div>
    </form>
  );
}
