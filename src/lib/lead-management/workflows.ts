import type { LeadType } from "@/lib/lead-management/types";

/**
 * Per-type lead lifecycles. `label` is shown to staff in `/dealflow-ai/leads`;
 * `portalLabel` is what the applicant / student / client sees in their portal
 * timeline. The last non-terminal stage is the "happy path" end; `terminal`
 * stages set the lead's `status` to won/lost and stop progression.
 */

export interface LeadStage {
  key: string;
  label: string;
  portalLabel: string;
  /** Present on end states. */
  terminal?: "won" | "lost";
}

export const LEAD_WORKFLOWS: Record<LeadType, LeadStage[]> = {
  job_applicant: [
    { key: "new_lead", label: "New Lead", portalLabel: "Application received" },
    { key: "contacted", label: "Contacted", portalLabel: "Recruiter reached out" },
    { key: "shortlisted", label: "Shortlisted", portalLabel: "Shortlisted" },
    { key: "interview_scheduled", label: "Interview Scheduled", portalLabel: "Interview scheduled" },
    { key: "technical_round", label: "Technical Round", portalLabel: "Technical round" },
    { key: "hr_round", label: "HR Round", portalLabel: "HR round" },
    { key: "selected", label: "Selected", portalLabel: "Selected" },
    { key: "offer_released", label: "Offer Released", portalLabel: "Offer released" },
    { key: "joined", label: "Joined", portalLabel: "Joined", terminal: "won" },
    { key: "rejected", label: "Rejected", portalLabel: "Not moving forward", terminal: "lost" },
  ],
  intern: [
    { key: "new", label: "New", portalLabel: "Application received" },
    { key: "contacted", label: "Contacted", portalLabel: "Team reached out" },
    { key: "enrolled", label: "Enrolled", portalLabel: "Enrolled" },
    { key: "batch_assigned", label: "Batch Assigned", portalLabel: "Batch assigned" },
    { key: "training_started", label: "Training Started", portalLabel: "Training started" },
    { key: "live_project", label: "Live Project", portalLabel: "Live project" },
    { key: "completed", label: "Completed", portalLabel: "Internship completed" },
    { key: "certificate_issued", label: "Certificate Issued", portalLabel: "Certificate issued", terminal: "won" },
    { key: "dropped", label: "Dropped", portalLabel: "Discontinued", terminal: "lost" },
  ],
  trainee: [
    { key: "new", label: "New", portalLabel: "Application received" },
    { key: "enrolled", label: "Enrolled", portalLabel: "Enrolled" },
    { key: "batch_assigned", label: "Batch Assigned", portalLabel: "Batch assigned" },
    { key: "classes_running", label: "Classes Running", portalLabel: "Classes running" },
    { key: "live_project", label: "Live Project", portalLabel: "Live project" },
    { key: "assessment", label: "Assessment", portalLabel: "Assessment" },
    { key: "completed", label: "Completed", portalLabel: "Training completed" },
    { key: "certificate_issued", label: "Certificate Issued", portalLabel: "Certificate issued", terminal: "won" },
    { key: "dropped", label: "Dropped", portalLabel: "Discontinued", terminal: "lost" },
  ],
  client: [
    { key: "new_inquiry", label: "New Inquiry", portalLabel: "Inquiry received" },
    { key: "requirement_discussion", label: "Requirement Discussion", portalLabel: "Requirement discussion" },
    { key: "proposal_shared", label: "Proposal Shared", portalLabel: "Proposal shared" },
    { key: "negotiation", label: "Negotiation", portalLabel: "Negotiation" },
    { key: "project_started", label: "Project Started", portalLabel: "Project started" },
    { key: "development", label: "Development", portalLabel: "In development" },
    { key: "delivery", label: "Delivery", portalLabel: "Delivery" },
    { key: "support", label: "Support", portalLabel: "Support & maintenance", terminal: "won" },
    { key: "closed_lost", label: "Closed (Lost)", portalLabel: "Closed", terminal: "lost" },
  ],
};

export function workflowFor(type: LeadType): LeadStage[] {
  return LEAD_WORKFLOWS[type];
}

export function firstStage(type: LeadType): string {
  return LEAD_WORKFLOWS[type][0].key;
}

export function stageMeta(type: LeadType, key: string): LeadStage | undefined {
  return LEAD_WORKFLOWS[type].find((s) => s.key === key);
}

export function stageIndex(type: LeadType, key: string): number {
  return LEAD_WORKFLOWS[type].findIndex((s) => s.key === key);
}

export function isValidStage(type: LeadType, key: string): boolean {
  return stageIndex(type, key) !== -1;
}

/**
 * Stages a staff member may move the lead to next: any later stage on the happy
 * path, plus every terminal stage (reject / drop / lost at any time). Not the
 * current stage, and — to keep the timeline honest — not earlier stages.
 */
export function nextStageOptions(type: LeadType, current: string): LeadStage[] {
  const wf = LEAD_WORKFLOWS[type];
  const idx = stageIndex(type, current);
  return wf.filter((s, i) => {
    if (s.key === current) return false;
    if (s.terminal) return true;
    return i > idx;
  });
}

/** Timeline steps for the portal: the happy path, marked done/current/upcoming. */
export type PortalStageState = "done" | "current" | "upcoming" | "skipped";

export function portalStageTimeline(
  type: LeadType,
  current: string
): { key: string; label: string; state: PortalStageState }[] {
  const wf = LEAD_WORKFLOWS[type];
  const currentStage = stageMeta(type, current);
  const lost = currentStage?.terminal === "lost";
  const happyPath = wf.filter((s) => !s.terminal);
  const curIdx = happyPath.findIndex((s) => s.key === current);

  // Terminal "won" stages count as the whole path done.
  if (currentStage?.terminal === "won") {
    return happyPath.map((s) => ({ key: s.key, label: s.portalLabel, state: "done" as const }));
  }

  return happyPath.map((s, i) => {
    let state: PortalStageState;
    if (lost) state = i === 0 ? "done" : "skipped";
    else if (curIdx === -1) state = "upcoming";
    else if (i < curIdx) state = "done";
    else if (i === curIdx) state = "current";
    else state = "upcoming";
    return { key: s.key, label: s.portalLabel, state };
  });
}
