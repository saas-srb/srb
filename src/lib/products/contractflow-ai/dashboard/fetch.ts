import "server-only";
import { lpmsCan } from "@/lib/lpms-roles";
import { cfClones, cfEvents, cfRequests, cfSigners } from "@/lib/products/contractflow-ai/cf-db";
import { canViewClone } from "@/lib/products/contractflow-ai/clones";
import { getCatalogueMeta } from "@/lib/products/playbook-ai/catalogue/registry";
import { ITEM_KIND_INFO, type ItemKind } from "@/lib/products/playbook-ai/items-types";
import { userNames } from "@/lib/products/playbook-ai/people";
import { cfFiltersKey, EMPTY_CF_FILTERS, type CfFilters } from "@/lib/products/contractflow-ai/dashboard/filters";
import { buildCfDashboard } from "@/lib/products/contractflow-ai/dashboard/compute";
import { IST_OFFSET_MS } from "@/lib/products/playbook-ai/dashboard/ranges";
import type { CloneDoc } from "@/lib/products/contractflow-ai/clone-types";
import type { LpmsViewer } from "@/lib/products/contractflow-ai/types";
import type { ActivityRow, CfDashboardData, CfDashboardInput, CfDocRow, CfEventRow, CfRequestRow, CfSignerRow, DateRange } from "@/lib/products/contractflow-ai/dashboard/types";

/**
 * Server side of the ContractFlow dashboard: projections only (never document bodies), the viewer's own visibility rules, a 60 second cache per
 * person and range. People who may sign or manage documents see everything; everyone else only the documents they created.
 */
const TTL_MS = 60_000;
const MAX_ROWS = 50_000;
const cache = new Map<string, { at: number; data: CfDashboardData }>();
let indexed = false;
const ms = (d: unknown): number | null => (d instanceof Date ? d.getTime() : typeof d === "string" || typeof d === "number" ? new Date(d).getTime() : null);
const dayMs = (s: string | null | undefined): number | null => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? ""); return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - IST_OFFSET_MS : null; };

export function cfDashboardScope(v: LpmsViewer): { all: boolean; userId: string } {
  const ctx = { roles: v.roles, permissionOverrides: v.overrides ?? undefined };
  return { all: lpmsCan(ctx as never, "SIGN") || lpmsCan(ctx as never, "MANAGE_DOCUMENTS"), userId: v.userId };
}

async function ensureIndexes(): Promise<void> {
  if (indexed) return;
  indexed = true;
  await Promise.all([
    (await cfClones()).createIndex({ deletedAt: 1, createdAt: -1 }).catch(() => {}),
    (await cfRequests()).createIndex({ createdAt: -1 }).catch(() => {}),
    (await cfSigners()).createIndex({ requestId: 1 }).catch(() => {}),
    (await cfEvents()).createIndex({ at: -1 }).catch(() => {}),
  ]);
}

export async function loadCfDashboard(v: LpmsViewer, range: DateRange, filters: CfFilters = EMPTY_CF_FILTERS, now = Date.now()): Promise<CfDashboardData | null> {
  if (!lpmsCan({ roles: v.roles, permissionOverrides: v.overrides ?? undefined } as never, "VIEW")) return null;
  const scope = cfDashboardScope(v);
  const key = `${v.userId}|${scope.all}|${range.key}|${range.from}|${range.to}|${cfFiltersKey(filters)}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.data;
  await ensureIndexes();
  const from = new Date(range.prevFrom);

  const clonesRaw = await (await cfClones()).find({ deletedAt: null } as never, { projection: { title: 1, kind: 1, status: 1, createdAt: 1, updatedAt: 1, createdBy: 1, party: 1, source: 1, dates: 1, stamp: 1 } } as never).limit(MAX_ROWS).toArray();
  const visible = (clonesRaw as unknown as CloneDoc[]).filter((c) => canViewClone(v, c));
  const docs: CfDocRow[] = visible.map((c) => {
    const kind = ((c.kind as ItemKind | undefined) ?? "document") as ItemKind;
    const meta = c.source?.docTypeId ? getCatalogueMeta(c.source.docTypeId) : null;
    return {
      id: c._id, title: c.title, kind, status: c.status, createdAt: ms(c.createdAt) ?? 0, updatedAt: ms(c.updatedAt) ?? 0, createdBy: c.createdBy ?? null,
      partyType: c.party?.type ?? "other", partyName: c.party?.displayName ?? "", typeLabel: meta?.name ?? ITEM_KIND_INFO[kind].plural, renewalAt: dayMs(c.dates?.renewalDate) ?? dayMs(c.dates?.expiryDate), stampPending: !!c.stamp?.required,
    };
  });
  const ids = new Set(docs.map((d) => d.id));

  const reqRaw = await (await cfRequests()).find({ $or: [{ createdAt: { $gte: from } }, { status: { $in: ["sent", "in_progress"] } }] } as never, { projection: { cloneId: 1, status: 1, createdAt: 1, expiresAt: 1, voidedAt: 1, createdBy: 1 } } as never).limit(MAX_ROWS).toArray();
  const requests: CfRequestRow[] = (reqRaw as unknown as { _id: string; cloneId: string; status: CfRequestRow["status"]; createdAt: Date; expiresAt: Date; voidedAt: Date | null; createdBy: string }[])
    .filter((r) => ids.has(r.cloneId)).map((r) => ({ id: r._id, cloneId: r.cloneId, status: r.status, createdAt: ms(r.createdAt) ?? 0, expiresAt: ms(r.expiresAt) ?? 0, voidedAt: ms(r.voidedAt), createdBy: r.createdBy ?? null }));
  const reqIds = requests.map((r) => r.id);
  const cloneOf = new Map(requests.map((r) => [r.id, r.cloneId]));
  const partyOf = new Map(docs.map((d) => [d.id, d.partyType]));

  const sigRaw = reqIds.length ? await (await cfSigners()).find({ requestId: { $in: reqIds } } as never, { projection: { requestId: 1, name: 1, role: 1, status: 1, createdAt: 1, documentViewedAt: 1, otpVerifiedAt: 1, signedAt: 1, declineReason: 1, otpLockedUntil: 1, "signature.kind": 1 } } as never).limit(MAX_ROWS).toArray() : [];
  const signers: CfSignerRow[] = (sigRaw as unknown as Record<string, unknown>[]).map((s) => {
    const cloneId = cloneOf.get(String(s.requestId)) ?? "";
    const kind = (s.signature as { kind?: string } | null | undefined)?.kind;
    return { id: String(s._id), requestId: String(s.requestId), cloneId, name: String(s.name ?? ""), role: String(s.role ?? ""), partyType: partyOf.get(cloneId) ?? "other", status: s.status as CfSignerRow["status"], sentAt: ms(s.createdAt) ?? 0, viewedAt: ms(s.documentViewedAt), otpVerifiedAt: ms(s.otpVerifiedAt), signedAt: ms(s.signedAt), declineReason: (s.declineReason as string | null) ?? null, lockedUntil: ms(s.otpLockedUntil), signatureKind: kind === "drawn" || kind === "typed" || kind === "uploaded" ? kind : null };
  });

  const evRaw = reqIds.length ? await (await cfEvents()).find({ requestId: { $in: reqIds }, at: { $gte: from }, type: { $in: ["otp_sent", "otp_failed", "otp_verified", "link_issued"] } } as never, { projection: { requestId: 1, type: 1, at: 1, data: 1 } } as never).limit(MAX_ROWS).toArray() : [];
  const events: CfEventRow[] = (evRaw as unknown as { requestId: string; type: string; at: Date; data?: Record<string, unknown> }[]).map((e) => ({ type: e.type, at: ms(e.at) ?? 0, requestId: e.requestId, channel: e.data?.channel === "sms" ? "sms" : e.data?.channel === "email" ? "email" : null, resent: e.data?.resent === true }));

  const actRaw = reqIds.length ? await (await cfEvents()).find({ requestId: { $in: reqIds.slice(0, 2000) } } as never, { projection: { requestId: 1, type: 1, at: 1, actorId: 1, actorType: 1, signerId: 1 } } as never).sort({ at: -1 }).limit(12).toArray() : [];
  const nameIds = new Set<string>([...docs.map((d) => d.createdBy), ...requests.map((r) => r.createdBy), ...(actRaw as unknown as { actorId?: string | null }[]).map((a) => a.actorId ?? null)].filter((x): x is string => !!x));
  const names = Object.fromEntries(await userNames([...nameIds]).catch(() => new Map<string, string>()));
  const LABEL: Record<string, string> = { request_created: "sent a document for signature", link_issued: "issued a signing link", link_viewed: "link opened", document_viewed: "document opened", otp_sent: "a code was sent", otp_verified: "identity confirmed", otp_failed: "wrong code entered", otp_locked: "codes locked after wrong attempts", signer_signed: "signed", signer_declined: "rejected", request_voided: "document voided", request_expired: "request expired", link_revoked: "link revoked" };
  const activity: ActivityRow[] = (actRaw as unknown as { requestId: string; type: string; at: Date; actorId?: string | null; actorType: string }[]).map((a) => ({
    at: ms(a.at) ?? 0, actorId: a.actorId ?? "", actor: a.actorType === "signer" ? "A signer" : a.actorId ? (names[a.actorId] ?? "Someone") : "System", action: a.type, summary: LABEL[a.type] ?? a.type.replace(/_/g, " "), documentId: cloneOf.get(a.requestId) ?? null,
  }));

  const input: CfDashboardInput = { docs, requests, signers, events, activity, names };
  const data = buildCfDashboard(input, range, scope, now, filters);
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: now, data });
  return data;
}
