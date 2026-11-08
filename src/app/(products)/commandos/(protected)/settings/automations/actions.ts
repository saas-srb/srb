"use server";

import { redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { isBillingLimitError } from "@/lib/platform/billing/enforce";
import { listWorkflowVersions, restoreWorkflowVersion, type WorkflowVersionView } from "@/lib/platform/workflows/versions";
import { createWorkflow, deleteWorkflow, listWorkflowRuns, listWorkflows, setWorkflowEnabled, updateWorkflow } from "@/lib/platform/workflows";
import { sendTestRun } from "@/lib/platform/workflows/run";
import { findTemplate } from "@/lib/platform/workflows/templates";
import type { WorkflowRunView, WorkflowView } from "@/lib/platform/workflows/shared";

export type AutomationResult = { ok: true; workflows: WorkflowView[]; message?: string } | { ok: false; error: string };

async function requireOwner() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  return user;
}

async function guarded(fn: () => Promise<AutomationResult>): Promise<AutomationResult> {
  try {
    return await fn();
  } catch (err) {
    if (isBillingLimitError(err)) return { ok: false, error: err.message };
    throw err;
  }
}

export async function saveAutomationAction(id: string | null, input: unknown): Promise<AutomationResult> {
  const user = await requireOwner();
  return guarded(async () => {
    const res = id ? await updateWorkflow(String(id), input, user.email) : await createWorkflow(input, user.id, user.email);
    if (!res.ok) return res;
    return { ok: true, workflows: await listWorkflows(), message: id ? "Automation saved." : "Automation created." };
  });
}

export async function addTemplateAction(key: string): Promise<AutomationResult> {
  const user = await requireOwner();
  return guarded(async () => {
    const template = findTemplate(String(key));
    if (!template) return { ok: false, error: "That template no longer exists." };
    const res = await createWorkflow(template.build(user.email), user.id, user.email);
    if (!res.ok) return res;
    return { ok: true, workflows: await listWorkflows(), message: `Added “${template.title}”.` };
  });
}

export async function toggleAutomationAction(id: string, enabled: boolean): Promise<AutomationResult> {
  const user = await requireOwner();
  return guarded(async () => {
    if (!(await setWorkflowEnabled(String(id), enabled === true, user.email))) return { ok: false, error: "That automation no longer exists." };
    return { ok: true, workflows: await listWorkflows() };
  });
}

export async function deleteAutomationAction(id: string): Promise<AutomationResult> {
  await requireOwner();
  return guarded(async () => {
    await deleteWorkflow(String(id));
    return { ok: true, workflows: await listWorkflows(), message: "Automation deleted." };
  });
}

export async function testAutomationAction(id: string): Promise<AutomationResult> {
  const user = await requireOwner();
  return guarded(async () => {
    const res = await sendTestRun(String(id), { id: user.id, email: user.email });
    const workflows = await listWorkflows();
    if (!res.ok) return { ok: false, error: `Test failed. ${res.error ?? ""}`.trim() };
    return { ok: true, workflows, message: `Test sent: ${(res.results ?? []).map((r) => r.detail).join(" · ")}` };
  });
}

export async function automationRunsAction(id: string): Promise<WorkflowRunView[]> {
  await requireOwner();
  return listWorkflowRuns(String(id), 30);
}

export async function automationVersionsAction(id: string): Promise<WorkflowVersionView[]> {
  await requireOwner();
  return listWorkflowVersions(String(id), 40);
}

/** Puts an earlier version of an automation back (it becomes the newest version). */
export async function restoreAutomationVersionAction(id: string, versionId: string): Promise<AutomationResult> {
  const user = await requireOwner();
  return guarded(async () => {
    const error = await restoreWorkflowVersion(String(id), String(versionId), user.email);
    if (error) return { ok: false, error };
    return { ok: true, workflows: await listWorkflows(), message: "Earlier version restored." };
  });
}
