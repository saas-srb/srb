import type { ProjectStatus, SceneJobStatus } from "./types";

/** The two state machines, as data, so the engine and the tests read the same rules. Pure. */

export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ["scripted", "cancelled"],
  scripted: ["scripted", "draft", "approved", "cancelled"],
  approved: ["generating", "scripted", "cancelled"],
  generating: ["ready", "failed", "cancelled"],
  ready: ["generating", "scripted", "draft"],
  failed: ["generating", "scripted", "draft"],
  cancelled: ["scripted", "draft"],
};

export const JOB_TRANSITIONS: Record<SceneJobStatus, SceneJobStatus[]> = {
  queued: ["submitting", "cancelled", "failed"],
  submitting: ["running", "queued", "failed", "cancelled"],
  running: ["succeeded", "queued", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export const JOB_TERMINAL: SceneJobStatus[] = ["succeeded", "failed", "cancelled"];
export const JOB_ACTIVE: SceneJobStatus[] = ["queued", "submitting", "running"];

export function canProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_TRANSITIONS[from]?.includes(to) ?? false;
}
export function canJob(from: SceneJobStatus, to: SceneJobStatus): boolean {
  return JOB_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Exponential backoff for retries: 30 s, 60 s, 120 s ... capped at 10 minutes. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 600_000);
}

/** Start of the current day in India (the product's business day), as a UTC instant. */
export function istDayStart(now: Date): Date {
  const IST = 5.5 * 3600_000;
  const local = new Date(now.getTime() + IST);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - IST);
}
