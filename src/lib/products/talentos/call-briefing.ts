import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { APPLICATIONS_COLLECTION } from "@/lib/career-applications";
import { canManageEmployees } from "@/lib/hrms-roles";
import type { AibotsViewer } from "@/lib/products/agentos/viewer";
import type { CallTarget } from "@/lib/products/agentos/calls/types";
import type { BriefingItem, BriefingSection } from "@/lib/products/agentos/calls/briefing-core";
import { orderedCalls, pastCallItem } from "@/lib/products/call-briefing-shared";
import type { AiCallEntry } from "@/lib/products/call-writeback";

/**
 * TalentOS' call-briefing provider for a candidate: the application they sent, the recruiters' notes on it and every earlier screening / HR
 * pre-qualification call (summary and answers). Same rule as placing the call: HR staff who manage employees. Never included: contact details,
 * resume files, offers and compensation, the portal account.
 */
const TALENTOS_PRODUCT = "talentos";
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const when = (d: unknown) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);

export async function talentosBriefing(viewer: AibotsViewer, target: CallTarget): Promise<BriefingSection[]> {
  if (target.product !== TALENTOS_PRODUCT || target.entityType !== "applicant" || !canManageEmployees(viewer.ctx)) return [];
  if (!/^[a-f\d]{24}$/i.test(target.entityId)) return [];
  const app = await (await getDb()).collection(APPLICATIONS_COLLECTION).findOne({ _id: new ObjectId(target.entityId) } as never);
  if (!app) return [];
  const row = (label: string, v: unknown): BriefingItem[] => (str(v) ? [{ text: `${label}: ${str(v)}` }] : []);
  const profile: BriefingSection = {
    key: "profile", title: "Candidate profile", kind: "profile", sourceCount: 1,
    items: [...row("Name", app.name), ...row("Position applied for", app.positionTitle), ...row("Application status", str(app.status).replace(/_/g, " ")), ...row("Came in through", app.source), ...row("Applied on", when(app.createdAt)?.slice(0, 10))],
  };
  const cover = str(app.coverNote);
  const submission: BriefingSection = { key: "submission", title: "What they wrote in their application", kind: "submission", sourceCount: cover ? 1 : 0, items: cover ? [{ at: when(app.createdAt), who: "Candidate", channel: "Application form", text: cover }] : [] };
  const calls = orderedCalls(
    (Array.isArray(app.aiCalls) ? (app.aiCalls as AiCallEntry[]) : []).map((e) => ({ callId: e.callId, at: e.at, purpose: e.purpose, status: e.status, outcome: e.outcome, summary: e.summary, fields: (e.fields ?? []).map((f) => ({ label: f.label, value: f.value })) }))
  );
  const notes = str(app.notes);
  return [
    profile,
    submission,
    { key: "previous_calls", title: "Previous screening and HR calls", kind: "calls", items: calls.map(pastCallItem), sourceCount: calls.length },
    { key: "team_notes", title: "Recruiter notes", kind: "notes", items: notes ? [{ who: "Team", text: notes }] : [], sourceCount: notes ? 1 : 0, internal: true },
  ];
}
