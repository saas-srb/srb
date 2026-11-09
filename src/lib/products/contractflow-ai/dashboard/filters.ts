/** ContractFlow dashboard filters (see the Playbook ones): read from the URL, applied to the rows before the aggregation. Pure and client-safe. */
import type { CfDashboardInput, CfDocRow } from "@/lib/products/contractflow-ai/dashboard/types";

export interface CfFilters { q: string; type: "" | "document" | "sop" | "kpi"; recipient: string; status: string; sender: string; channel: "" | "email" | "sms" }
export const EMPTY_CF_FILTERS: CfFilters = { q: "", type: "", recipient: "", status: "", sender: "", channel: "" };
export const CF_TYPE_OPTIONS = [{ value: "document", label: "Document" }, { value: "sop", label: "SOP" }, { value: "kpi", label: "KPI sheet" }];
export const CF_RECIPIENT_OPTIONS = [{ value: "client", label: "Client" }, { value: "employee", label: "Employee" }, { value: "vendor", label: "Vendor" }, { value: "candidate", label: "Candidate" }, { value: "other", label: "Other" }];
export const CF_STATUS_OPTIONS = [{ value: "draft", label: "Draft" }, { value: "sent", label: "Sent for signature" }, { value: "signed", label: "Signed" }, { value: "rejected", label: "Rejected" }, { value: "expired", label: "Expired" }, { value: "voided", label: "Voided" }];
export const CF_CHANNEL_OPTIONS = [{ value: "email", label: "Email" }, { value: "sms", label: "SMS" }];

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";
const clean = (v: string, max = 80): string => v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);

export function parseCfFilters(sp: Record<string, string | string[] | undefined>): CfFilters {
  const type = one(sp.type), recipient = one(sp.recipient), status = one(sp.status), channel = one(sp.channel);
  return {
    q: clean(one(sp.q)), type: type === "document" || type === "sop" || type === "kpi" ? type : "", recipient: CF_RECIPIENT_OPTIONS.some((o) => o.value === recipient) ? recipient : "",
    status: CF_STATUS_OPTIONS.some((o) => o.value === status) ? status : "", sender: clean(one(sp.sender), 64), channel: channel === "email" || channel === "sms" ? channel : "",
  };
}
export const countCfFilters = (f: CfFilters): number => Object.values(f).filter((v) => v !== "").length;
export const cfFiltersKey = (f: CfFilters): string => JSON.stringify(f);

/** The status shown for a document in this product's filter. */
export function cfStatusOf(d: Pick<CfDocRow, "status">): string {
  switch (d.status) {
    case "clone_draft": case "ready": return "draft";
    case "sent": case "partially_signed": return "sent";
    case "signed": return "signed";
    case "declined": return "rejected";
    case "expired": return "expired";
    default: return "voided";
  }
}

export interface CfFilterOptions { senders: { id: string; name: string }[] }
export function cfFilterOptions(input: CfDashboardInput): CfFilterOptions {
  const ids = [...new Set(input.requests.map((r) => r.createdBy).filter((x): x is string => !!x))];
  return { senders: ids.map((id) => ({ id, name: input.names[id] ?? "Someone" })).sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Narrows documents first (type, recipient type, status, search on title or recipient), then the requests (sender, code channel), then what belongs to them. Pure. */
export function applyCfFilters(input: CfDashboardInput, f: CfFilters): CfDashboardInput {
  if (countCfFilters(f) === 0) return input;
  const signersByReq = new Map<string, string[]>();
  for (const s of input.signers) signersByReq.set(s.requestId, [...(signersByReq.get(s.requestId) ?? []), s.name]);
  const reqOfDoc = new Map<string, string[]>();
  for (const r of input.requests) reqOfDoc.set(r.cloneId, [...(reqOfDoc.get(r.cloneId) ?? []), r.id]);
  const q = f.q.toLowerCase();
  const channelReqs = f.channel ? new Set(input.events.filter((e) => e.type === "otp_sent" && e.channel === f.channel).map((e) => e.requestId)) : null;
  const reqOk = (r: { id: string; createdBy: string | null }) => (!f.sender || r.createdBy === f.sender) && (!channelReqs || channelReqs.has(r.id));
  const requests0 = input.requests.filter(reqOk);
  const docs = input.docs.filter((d) => {
    if (f.type && d.kind !== f.type) return false;
    if (f.recipient && d.partyType !== f.recipient) return false;
    if (f.status && cfStatusOf(d) !== f.status) return false;
    if (q) {
      const names = (reqOfDoc.get(d.id) ?? []).flatMap((id) => signersByReq.get(id) ?? []);
      if (!d.title.toLowerCase().includes(q) && !d.partyName.toLowerCase().includes(q) && !names.some((n) => n.toLowerCase().includes(q))) return false;
    }
    // A sender or channel filter keeps only documents that have a matching request.
    if ((f.sender || f.channel) && !requests0.some((r) => r.cloneId === d.id)) return false;
    return true;
  });
  const ids = new Set(docs.map((d) => d.id));
  const requests = requests0.filter((r) => ids.has(r.cloneId));
  const rid = new Set(requests.map((r) => r.id));
  return { docs, requests, signers: input.signers.filter((s) => rid.has(s.requestId)), events: input.events.filter((e) => rid.has(e.requestId)), activity: input.activity.filter((a) => (a.documentId ? ids.has(a.documentId) : false)), names: input.names };
}
