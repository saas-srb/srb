import "server-only";
import { notifyPanel, notifyUsers } from "@/lib/notify";
import { day, plural, short, today } from "@/lib/notify/triggers/format";

/**
 * Lead & career notifications. A lead with an owner tells the owner (and managers for the big moments); an unowned lead tells the
 * whole LMS team. The person who made the change is never told about their own action.
 */
const TYPE_LABEL: Record<string, string> = { client: "client enquiry", trainee: "training enquiry", intern: "internship enquiry", job_applicant: "job application" };
const label = (t: string) => TYPE_LABEL[t] ?? t.replace(/_/g, " ");

interface L { id: string; code?: string; name: string; type: string; ownerStaffId?: string | null }
const link = (l: { id: string }) => `/dealflow-ai/leads/${l.id}`;

export const lmsEvents = {
  leadCreated: (l: L & { source?: string; message?: string | null }, actor: string | null) =>
    l.ownerStaffId
      ? notifyUsers("lms", [l.ownerStaffId].filter((i) => i !== actor), { type: "lms_lead_assigned", title: `New ${label(l.type)} assigned to you`, body: `${l.name}${l.code ? ` · ${l.code}` : ""}`, link: link(l) })
      : notifyPanel("lms", { type: "lms_lead_new", title: `New ${label(l.type)}: ${l.name}`, body: short(l.message, 100) || `${l.code ?? ""}${l.source ? ` · via ${l.source}` : ""}`.trim() || "A new lead just came in.", link: link(l), priority: "high", dedupeKey: `lms-lead-new:${l.id}` }, { level: "any", exceptUserId: actor }),
  leadAssigned: (l: L, ownerId: string | null, actor: string) =>
    ownerId && ownerId !== actor ? notifyUsers("lms", [ownerId], { type: "lms_lead_assigned", title: `${l.name} was assigned to you`, body: `${label(l.type)}${l.code ? ` · ${l.code}` : ""}`, link: link(l), priority: "high" }) : Promise.resolve(0),
  stageChanged: async (l: L, stageLabel: string, terminal: "won" | "lost" | null | undefined, actor: string) => {
    if (l.ownerStaffId && l.ownerStaffId !== actor) await notifyUsers("lms", [l.ownerStaffId], { type: "lms_stage_changed", title: `${l.name} → ${stageLabel}`, body: label(l.type), link: link(l) });
    if (terminal) await notifyPanel("lms", { type: terminal === "won" ? "lms_lead_won" : "lms_lead_lost", title: `${terminal === "won" ? "Won" : "Lost"}: ${l.name}`, body: `${label(l.type)} · ${stageLabel}`, link: link(l), priority: terminal === "won" ? "normal" : "high", dedupeKey: `lms-terminal:${l.id}:${terminal}` }, { level: "admin", exceptUserId: actor });
  },
  portalReply: (l: L, preview: string) =>
    l.ownerStaffId
      ? notifyUsers("lms", [l.ownerStaffId], { type: "lms_lead_reply", title: `${l.name} replied`, body: short(preview, 120), link: `${link(l)}#messages`, priority: "high" })
      : notifyPanel("lms", { type: "lms_lead_reply", title: `${l.name} replied (no owner yet)`, body: short(preview, 120), link: `${link(l)}#messages`, priority: "high" }, { level: "any" }),
  interviewScheduled: (l: L | null, title: string, when: Date, actor: string) =>
    l?.ownerStaffId && l.ownerStaffId !== actor ? notifyUsers("lms", [l.ownerStaffId], { type: "lms_interview", title: `Interview scheduled: ${short(title, 60)}`, body: `${l.name} · ${day(when)} ${when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`, link: link(l) }) : Promise.resolve(0),
  applicationReceived: (a: { id: string; name: string; positionTitle: string }) =>
    notifyPanel("lms", { type: "lms_application_new", title: `New application: ${a.name}`, body: a.positionTitle, link: `/dealflow-ai/careers/applicants/${a.id}`, priority: "high", dedupeKey: `lms-app-new:${a.id}` }, { level: "staff" }),
  staleDigest: async (leads: { count: number; names: string[] }, apps: { count: number; names: string[] }) => {
    if (leads.count > 0) await notifyPanel("lms", { type: "lms_stale_leads", title: `${plural(leads.count, "lead")} waiting too long`, body: leads.names.length ? `Oldest: ${leads.names.join(", ")}` : "Open leads with no progress.", link: "/dealflow-ai/leads/list", priority: "high", dedupeKey: `lms-stale-leads:${today()}` }, { level: "staff" });
    if (apps.count > 0) await notifyPanel("lms", { type: "lms_stale_applications", title: `${plural(apps.count, "application")} waiting too long`, body: apps.names.length ? `Oldest: ${apps.names.join(", ")}` : "Open applications with no update.", link: "/dealflow-ai/careers/applicants", priority: "high", dedupeKey: `lms-stale-apps:${today()}` }, { level: "staff" });
  },
};
