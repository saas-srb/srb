import "server-only";
import { getDb } from "@/lib/mongodb";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { playbookCan } from "@/lib/playbook-roles";
import { seesAllDocuments } from "@/lib/products/playbook-ai/status";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";
import { CATEGORY_LABELS } from "@/lib/products/playbook-ai/catalogue/types";
import { getCatalogueMeta } from "@/lib/products/playbook-ai/catalogue/registry";
import { listLibrary } from "@/lib/products/playbook-ai/item-library";
import { ITEM_KIND_INFO, type ItemKind } from "@/lib/products/playbook-ai/items-types";
import { EMPTY_PB_FILTERS, pbFiltersKey, type PbFilters } from "@/lib/products/playbook-ai/dashboard/filters";
import { buildDashboard } from "@/lib/products/playbook-ai/dashboard/compute";
import type { ActivityRow, AiRunRow, DashDocStatus, DashSendStatus, DashboardData, DashboardInput, DateRange, DocRow, ExportRow, SendRow } from "@/lib/products/playbook-ai/dashboard/types";

/**
 * The server side of the Playbook dashboard: reads only what the aggregation needs (projections, never document bodies), scoped to the person
 * (managers see the company, everyone else only their own), then hands the rows to the pure `buildDashboard`. Results are cached for a minute per
 * person and range. Tenancy is automatic: every collection here is company-scoped by the shared database wrapper.
 */

const TTL_MS = 60_000;
const MAX_ROWS = 50_000;
const cache = new Map<string, { at: number; data: DashboardData }>();
let indexed = false;

async function ensureIndexes(): Promise<void> {
  if (indexed) return;
  indexed = true;
  const db = await getDb();
  await Promise.all([
    db.collection(PB_COLLECTIONS.documents).createIndex({ deletedAt: 1, createdAt: -1 }).catch(() => {}),
    db.collection(PB_COLLECTIONS.documents).createIndex({ createdBy: 1, deletedAt: 1 }).catch(() => {}),
    db.collection(PB_COLLECTIONS.handoffs).createIndex({ sentAt: -1 }).catch(() => {}),
    db.collection(PB_COLLECTIONS.aiRuns).createIndex({ createdAt: -1 }).catch(() => {}),
    db.collection(PB_COLLECTIONS.audit).createIndex({ action: 1, createdAt: -1 }).catch(() => {}),
  ]);
}

const ms = (d: unknown): number | null => (d instanceof Date ? d.getTime() : typeof d === "string" || typeof d === "number" ? new Date(d).getTime() : null);
const OPEN: DashSendStatus[] = ["sent", "viewed", "partially_signed"];

export function dashboardScope(actor: PbActor): { all: boolean; userId: string } {
  return { all: seesAllDocuments(actor), userId: actor.id };
}

export async function loadDashboard(actor: PbActor, range: DateRange, filters: PbFilters = EMPTY_PB_FILTERS, now = Date.now()): Promise<DashboardData | null> {
  if (!playbookCan(actor, "VIEW")) return null;
  const scope = dashboardScope(actor);
  const key = `${actor.id}|${scope.all}|${range.key}|${range.from}|${range.to}|${pbFiltersKey(filters)}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.data;
  await ensureIndexes();
  const db = await getDb();
  const from = new Date(range.prevFrom);
  const mine = scope.all ? {} : { createdBy: actor.id };

  const [docsRaw, handoffs, aiRaw, exportRaw, activityRaw] = await Promise.all([
    db.collection(PB_COLLECTIONS.documents).find({ deletedAt: null, ...mine } as never, { projection: { title: 1, kind: 1, status: 1, createdAt: 1, updatedAt: 1, createdBy: 1, meta: 1, docTypeId: 1, versionSeq: 1, legalAck: 1, issuedAt: 1, review: 1, lastEditor: 1 } }).limit(MAX_ROWS).toArray(),
    db.collection(PB_COLLECTIONS.handoffs).find({ ...(scope.all ? {} : { sentBy: actor.id }), $or: [{ sentAt: { $gte: from } }, { status: { $in: OPEN } }] } as never, { projection: { documentId: 1, cloneId: 1, sentAt: 1, status: 1, statusLog: 1, sentBy: 1, sentByName: 1, partyName: 1, partyType: 1 } }).limit(MAX_ROWS).toArray(),
    db.collection(PB_COLLECTIONS.aiRuns).find({ createdAt: { $gte: from }, ...(scope.all ? {} : { userId: actor.id }) } as never, { projection: { documentId: 1, userId: 1, userName: 1, inputTokens: 1, outputTokens: 1, status: 1, createdAt: 1 } }).limit(MAX_ROWS).toArray(),
    db.collection(PB_COLLECTIONS.audit).find({ action: "export", createdAt: { $gte: from }, ...(scope.all ? {} : { actorId: actor.id }) } as never, { projection: { actorId: 1, createdAt: 1, "metadata.format": 1 } }).limit(MAX_ROWS).toArray(),
    db.collection(PB_COLLECTIONS.audit).find((scope.all ? {} : { actorId: actor.id }) as never, { projection: { actorId: 1, actorEmail: 1, action: 1, summary: 1, documentId: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(12).toArray(),
  ]);

  const names: Record<string, string> = {};
  const libraryTitle = new Map<string, string>([...listLibrary("sop"), ...listLibrary("kpi")].map((e) => [e.id, e.title]));

  const docs: DocRow[] = docsRaw.map((d) => {
    const r = d as unknown as Record<string, unknown>;
    const kind = (r.kind as ItemKind | undefined) ?? "document";
    const meta = (r.meta ?? {}) as { department?: string; designation?: string; libraryId?: string };
    const docTypeId = (r.docTypeId as string | null) ?? null;
    const cat = docTypeId ? getCatalogueMeta(docTypeId) : null;
    const templateId = meta.libraryId ?? docTypeId;
    const createdBy = (r.createdBy as string | null) ?? null;
    const le = r.lastEditor as { id?: string; name?: string | null } | null | undefined;
    if (le?.id && le.name) names[le.id] = le.name;
    const review = r.review as { decidedAt?: Date | null } | null | undefined;
    return {
      id: String(r._id), title: String(r.title ?? "Untitled"), kind, status: (r.status as DashDocStatus) ?? "draft",
      createdAt: ms(r.createdAt) ?? 0, updatedAt: ms(r.updatedAt) ?? ms(r.createdAt) ?? 0, createdBy,
      department: (kind === "kpi" ? meta.designation : meta.department) ?? "",
      category: cat ? CATEGORY_LABELS[cat.category] : ITEM_KIND_INFO[kind].plural,
      templateId, templateName: meta.libraryId ? (libraryTitle.get(meta.libraryId) ?? null) : cat?.name ?? null,
      versionSeq: Number(r.versionSeq ?? 0),
      legalPending: !!cat?.legal.review && !r.legalAck,
      reviewedAt: ms(review?.decidedAt) ?? ms(r.issuedAt),
    };
  });
  const titleOf = new Map(docs.map((d) => [d.id, d.title]));

  const sends: SendRow[] = handoffs.map((h) => {
    const r = h as unknown as Record<string, unknown>;
    const log = (Array.isArray(r.statusLog) ? r.statusLog : []) as { status: string; at: Date }[];
    const first = (names_: string[]) => log.filter((e) => names_.includes(e.status)).map((e) => ms(e.at)).filter((x): x is number => x !== null).sort((a, b) => a - b)[0] ?? null;
    const sentBy = (r.sentBy as string | null) ?? null;
    if (sentBy && r.sentByName) names[sentBy] = String(r.sentByName);
    const status = r.status as DashSendStatus;
    return {
      id: String(r._id), documentId: String(r.documentId), cloneId: String(r.cloneId), title: titleOf.get(String(r.documentId)) ?? "Document",
      sentAt: ms(r.sentAt) ?? 0, viewedAt: first(["viewed", "partially_signed", "signed"]), signedAt: status === "signed" ? first(["signed"]) ?? ms(r.statusAt) : null,
      status, sentBy, partyName: String(r.partyName ?? ""), partyType: String(r.partyType ?? ""),
    };
  });

  const ai: AiRunRow[] = aiRaw.map((a) => {
    const r = a as unknown as Record<string, unknown>;
    if (r.userId && r.userName) names[String(r.userId)] = String(r.userName);
    return { at: ms(r.createdAt) ?? 0, userId: String(r.userId), documentId: String(r.documentId), inputTokens: Number(r.inputTokens ?? 0), outputTokens: Number(r.outputTokens ?? 0), status: r.status as AiRunRow["status"] };
  });
  const exports: ExportRow[] = exportRaw.map((e) => {
    const r = e as unknown as { actorId: string; createdAt: Date; metadata?: { format?: string } };
    const f = r.metadata?.format;
    return { at: ms(r.createdAt) ?? 0, actorId: r.actorId, format: f === "pdf" ? "pdf" : f === "docx" ? "docx" : "other" };
  });
  const activity: ActivityRow[] = activityRaw.map((a) => {
    const r = a as unknown as Record<string, unknown>;
    return { at: ms(r.createdAt) ?? 0, actorId: String(r.actorId), actor: names[String(r.actorId)] ?? (typeof r.actorEmail === "string" ? r.actorEmail.split("@")[0] : "Someone"), action: String(r.action), summary: String(r.summary ?? r.action), documentId: (r.documentId as string | null) ?? null };
  });

  const input: DashboardInput = { docs, sends, ai, exports, activity, names };
  const data = buildDashboard(input, range, scope, now, filters);
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: now, data });
  return data;
}
