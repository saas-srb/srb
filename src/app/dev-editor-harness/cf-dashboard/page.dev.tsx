import { notFound } from "next/navigation";
import CfDashboardView from "@/components/products/contractflow-ai/CfDashboardView";
import { parseCfFilters } from "@/lib/products/contractflow-ai/dashboard/filters";
import { buildCfDashboard } from "@/lib/products/contractflow-ai/dashboard/compute";
import { DAY_MS, istDayStart, resolveRange } from "@/lib/products/playbook-ai/dashboard/ranges";
import type { CfCloneStatus, CfDashboardInput, CfDocRow, CfEventRow, CfRequestRow, CfSignerRow } from "@/lib/products/contractflow-ai/dashboard/types";

/** Development-only: the real ContractFlow dashboard over SEEDED sample rows (a fixed generator); they exist only here, never in the product. 404 in production. `?empty=1` shows the empty state. */
export const dynamic = "force-dynamic";

function seeded(): CfDashboardInput {
  let s = 777;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const now = Date.now(), today = istDayStart(now);
  const users: [string, string][] = [["u1", "Priya Nair"], ["u2", "Ravi Menon"], ["u3", "Asha Rao"]];
  const types = ["Master services agreement", "Offer letter", "Mutual NDA", "Freelancer agreement", "Vendor agreement"];
  const docs: CfDocRow[] = [], requests: CfRequestRow[] = [], signers: CfSignerRow[] = [], events: CfEventRow[] = [];
  for (let i = 0; i < 140; i++) {
    const age = Math.floor(Math.pow(rnd(), 1.4) * 95);
    const created = today - age * DAY_MS + Math.floor(rnd() * 20) * 3_600_000;
    const [uid] = pick(users);
    const partyType = pick(["client", "employee", "employee", "vendor", "other"]);
    const sent = rnd() < 0.8;
    let status: CfCloneStatus = sent ? "sent" : pick(["clone_draft", "ready"]);
    const doc: CfDocRow = { id: `d${i}`, title: `${pick(types)} ${i}`, kind: "document", status, createdAt: created, updatedAt: created, createdBy: uid, partyType, partyName: pick(["Asha Rao", "Ravi Menon", "Northwind Demo", "Orbit Software"]), typeLabel: pick(types), renewalAt: rnd() < 0.2 ? now + Math.floor(rnd() * 60) * DAY_MS : null, stampPending: rnd() < 0.15 };
    docs.push(doc);
    if (!sent) continue;
    const at = created + Math.floor(rnd() * 3) * DAY_MS;
    if (at > now) continue;
    const r = rnd();
    const rs: CfRequestRow["status"] = r < 0.55 ? "completed" : r < 0.8 ? "sent" : r < 0.88 ? "in_progress" : r < 0.94 ? "declined" : r < 0.98 ? "expired" : "voided";
    const req: CfRequestRow = { id: `r${i}`, cloneId: doc.id, status: rs, createdAt: at, expiresAt: at + 14 * DAY_MS, voidedAt: rs === "voided" ? at + DAY_MS : null, createdBy: uid };
    requests.push(req);
    doc.status = rs === "completed" ? "signed" : rs === "declined" ? "declined" : rs === "expired" ? "expired" : rs === "voided" ? "voided" : "sent";
    const viewed = rs !== "sent" || rnd() < 0.5;
    const otp = viewed && rnd() < 0.8;
    const signedAt = rs === "completed" ? Math.min(at + (0.2 + rnd() * rnd() * 12) * DAY_MS, now) : null;
    signers.push({ id: `s${i}`, requestId: req.id, cloneId: doc.id, name: pick(["Asha Rao", "Ravi Menon", "Northwind Demo", "Orbit Software"]), role: "counterparty", partyType, status: signedAt ? "signed" : rs === "declined" ? "declined" : otp ? "otp_verified" : viewed ? "viewed" : "sent", sentAt: at, viewedAt: viewed ? at + 0.3 * DAY_MS : null, otpVerifiedAt: otp ? at + 0.4 * DAY_MS : null, signedAt, declineReason: rs === "declined" ? pick(["Terms not accepted", "Wrong party", "Needs changes to clause 5"]) : null, lockedUntil: rnd() < 0.02 ? now + 900_000 : null, signatureKind: signedAt ? pick(["drawn", "typed", "typed", "uploaded"]) : null });
    events.push({ type: "otp_sent", at: at + 0.35 * DAY_MS, requestId: req.id, channel: rnd() < 0.8 ? "email" : "sms", resent: false });
    if (otp) events.push({ type: "otp_verified", at: at + 0.4 * DAY_MS, requestId: req.id, channel: null, resent: false });
    if (rnd() < 0.15) events.push({ type: "otp_failed", at: at + 0.38 * DAY_MS, requestId: req.id, channel: null, resent: false });
    if (rnd() < 0.2) events.push({ type: "link_issued", at: at + 3 * DAY_MS, requestId: req.id, channel: null, resent: true });
  }
  const activity = docs.slice(0, 12).map((d, i) => ({ at: now - i * 4_000_000, actorId: "u1", actor: pick(users)[1], action: "request_created", summary: pick(["sent a document for signature", "identity confirmed", "signed", "link opened"]), documentId: d.id }));
  return { docs, requests, signers, events, activity, names: Object.fromEntries(users) };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string; empty?: string; from?: string; to?: string; mine?: string; [k: string]: string | undefined }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const now = Date.now();
  const range = resolveRange(sp.range, now, { from: sp.from, to: sp.to });
  const input: CfDashboardInput = sp.empty ? { docs: [], requests: [], signers: [], events: [], activity: [], names: {} } : seeded();
  return <div className="mx-auto max-w-7xl p-4 sm:p-6"><CfDashboardView data={buildCfDashboard(input, range, { all: !sp.mine, userId: "u1" }, now, parseCfFilters(sp))} rangeHrefBase="/dev-editor-harness/cf-dashboard" canSettings /></div>;
}
