import "server-only";
import { notifyRoles, notifyUsers } from "@/lib/notify";

/**
 * Document workflow notifications, through the existing notification centre (panel "sop"), so a company can switch channels and reword each
 * event in Settings > Notifications. Best effort: `notifyUsers` and `notifyRoles` never throw. The person who made the change is not told.
 */

const REVIEWERS = ["super_admin", "sop_admin", "sop_manager"];
const link = (id: string) => `/playbook-ai/documents/${id}`;
const short = (s: string, n = 70) => s.replace(/\s+/g, " ").trim().slice(0, n);

export interface NotifyDoc { id: string; title: string; docNumber: string | null; createdBy: string | null; submittedBy: string | null }
const label = (d: NotifyDoc) => `${d.docNumber ? `${d.docNumber} · ` : ""}${short(d.title)}`;
const others = (ids: (string | null)[], actor: string) => [...new Set(ids.filter((x): x is string => !!x && x !== actor))];

export const pbEvents = {
  reviewRequested: (d: NotifyDoc, actor: string) =>
    notifyRoles("sop", REVIEWERS, { type: "sop_doc_review_requested", title: `Approval needed: ${short(d.title, 60)}`, body: label(d), link: link(d.id), priority: "high", dedupeKey: `pbdoc-review:${d.id}:${Date.now() >> 16}` }, actor),
  approved: (d: NotifyDoc, actor: string, auto: boolean) =>
    auto ? Promise.resolve(0) : notifyUsers("sop", others([d.createdBy, d.submittedBy], actor), { type: "sop_doc_approved", title: `Approved: ${short(d.title, 60)}`, body: label(d), link: link(d.id) }),
  rejected: (d: NotifyDoc, actor: string, reason: string) =>
    notifyUsers("sop", others([d.createdBy, d.submittedBy], actor), { type: "sop_doc_rejected", title: `Sent back: ${short(d.title, 60)}`, body: `Reason: ${short(reason, 200)}`, link: link(d.id), priority: "high" }),
  issued: (d: NotifyDoc, actor: string) =>
    notifyUsers("sop", others([d.createdBy, d.submittedBy], actor), { type: "sop_doc_issued", title: `Issued: ${short(d.title, 60)}`, body: label(d), link: link(d.id) }),
};
