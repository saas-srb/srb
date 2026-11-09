import "server-only";
import { applyBrandToDoc, brandRenderOptions, loadBrand } from "@/lib/products/playbook-ai/brand/apply";
import { loadCompanyValues } from "@/lib/products/playbook-ai/brand/company-values";
import { todayIso } from "@/lib/products/playbook-ai/db";
import { renderPdf } from "@/lib/products/playbook-ai/doc/render/pdf";
import { layoutInputFor } from "@/lib/products/playbook-ai/items-layout";
import { previewLibraryFile } from "@/lib/products/playbook-ai/library-preview";
import { getDb } from "@/lib/mongodb";
import { playbookCan } from "@/lib/playbook-roles";
import { cfClones, cfSigners } from "@/lib/products/contractflow-ai/cf-db";
import { createDocument, getDocument, listDocuments } from "@/lib/products/playbook-ai/documents";
import type { PbActor, PbDocumentSummary, PbResult } from "@/lib/products/playbook-ai/documents-types";
import { listHandoffsForDocuments } from "@/lib/products/playbook-ai/handoff";
import { buildLibraryDoc } from "@/lib/products/playbook-ai/item-library";
import { ITEM_KIND_INFO, type ItemKind, type ItemRow, type ItemSendInfo, type SendState } from "@/lib/products/playbook-ai/items-types";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";

/** Server side of the three item screens (SOPs, Documents, KPI sheets): lists with ContractFlow status, "Use" from the library. */

const CLONE_TO_STATE: Record<string, SendState> = {
  clone_draft: "clone_draft", ready: "ready", sent: "sent", partially_signed: "partially_signed", signed: "signed", declined: "declined", expired: "expired", voided: "voided",
};

/** The latest copy of each item in ContractFlow, with its live state (viewed is derived from the signers). */
export async function sendInfoFor(documentIds: string[]): Promise<Map<string, ItemSendInfo>> {
  const out = new Map<string, ItemSendInfo>();
  const handoffs = await listHandoffsForDocuments(documentIds);
  const cloneIds = [...handoffs.values()].map((h) => h[0]?.cloneId).filter((x): x is string => !!x);
  if (cloneIds.length === 0) return out;
  const clones = await (await cfClones()).find({ _id: { $in: cloneIds } }, { projection: { status: 1, requestId: 1, updatedAt: 1, "party.displayName": 1, deletedAt: 1 } }).toArray();
  const byId = new Map(clones.map((c) => [c._id, c]));
  const requestIds = clones.filter((c) => c.status === "sent" && c.requestId).map((c) => c.requestId as string);
  const viewedRequests = new Set<string>();
  if (requestIds.length) {
    const viewed = await (await cfSigners()).find({ requestId: { $in: requestIds }, documentViewedAt: { $ne: null } }, { projection: { requestId: 1 } } as never).toArray();
    for (const v of viewed) viewedRequests.add(v.requestId);
  }
  for (const [docId, rows] of handoffs) {
    const clone = byId.get(rows[0].cloneId);
    if (!clone || clone.deletedAt) continue;
    let state = CLONE_TO_STATE[clone.status] ?? "clone_draft";
    if (state === "sent" && clone.requestId && viewedRequests.has(clone.requestId)) state = "viewed";
    out.set(docId, { cloneId: clone._id, state, partyName: clone.party.displayName, at: clone.updatedAt.toISOString(), copies: rows.length });
  }
  return out;
}

export interface ListItemsInput { kind: ItemKind; q?: string; tab?: string; department?: string; page?: number }

export async function listItems(actor: PbActor, input: ListItemsInput): Promise<PbResult<{ rows: ItemRow[]; counts: Record<string, number>; total: number }>> {
  const r = await listDocuments(actor, { kind: input.kind, q: input.q, pageSize: 100 });
  if (!r.ok) return r;
  const send = await sendInfoFor(r.items.map((i) => i._id));
  const toRow = (d: PbDocumentSummary): ItemRow => ({
    id: d._id, title: d.title, kind: input.kind, department: d.meta?.department ?? "", designation: d.meta?.designation ?? "", status: d.status,
    updatedAt: d.updatedAt.toISOString(), updatedBy: d.lastEditor?.name || d.lastEditor?.email || "", versionCount: d.versionSeq, send: send.get(d._id) ?? null,
  });
  let rows = r.items.map(toRow);
  if (input.department) rows = rows.filter((x) => x.department === input.department);
  const counts: Record<string, number> = { all: rows.length, draft: 0, sent: 0, signed: 0 };
  for (const x of rows) {
    if (!x.send) counts.draft++;
    else if (x.send.state === "signed") counts.signed++;
    else counts.sent++;
  }
  const tab = input.tab ?? "all";
  if (tab === "draft") rows = rows.filter((x) => !x.send);
  else if (tab === "sent") rows = rows.filter((x) => x.send && x.send.state !== "signed");
  else if (tab === "signed") rows = rows.filter((x) => x.send?.state === "signed");
  return { ok: true, rows, counts, total: r.total };
}

/** "Use": copies a library SOP or KPI sheet into the company's own items as a new draft. */
export async function useLibraryItem(actor: PbActor, libraryId: string): Promise<PbResult<{ documentId: string }>> {
  if (!playbookCan(actor, "CREATE")) return { ok: false, error: { code: "forbidden", message: "You are not allowed to create documents." } };
  const built = buildLibraryDoc(String(libraryId));
  if (!built) return { ok: false, error: { code: "not_found", message: "That library entry does not exist." } };
  const r = await createDocument(actor, { title: built.info.title, kind: built.info.kind, meta: built.meta, pbdoc: built.doc });
  return r.ok ? { ok: true, documentId: r.document._id } : r;
}

export async function setItemMeta(actor: PbActor, id: string, patch: { title?: string; department?: string; designation?: string; description?: string; reviewPeriod?: string }): Promise<PbResult<object>> {
  if (!playbookCan(actor, "EDIT")) return { ok: false, error: { code: "forbidden", message: "You are not allowed to edit documents." } };
  const g = await getDocument(actor, String(id));
  if (!g.ok) return g;
  if (!g.capabilities.edit) return { ok: false, error: { code: "forbidden", message: "You are not allowed to edit this item." } };
  const set: Record<string, unknown> = {};
  for (const k of ["department", "designation", "description", "reviewPeriod"] as const) if (typeof patch[k] === "string") set[`meta.${k}`] = (patch[k] as string).trim().slice(0, k === "description" ? 2000 : 120);
  if (typeof patch.title === "string" && patch.title.trim()) set.title = patch.title.trim().slice(0, 200);
  const c = (await getDb()).collection(PB_COLLECTIONS.documents);
  const r = await c.updateOne({ _id: String(id).slice(0, 64), deletedAt: null, status: "draft" } as never, { $set: { ...set, updatedAt: new Date() } as never });
  return r.matchedCount ? { ok: true } : { ok: false, error: { code: "not_found", message: "That item was not found or is not a draft." } };
}

export const kindTitle = (k: ItemKind) => ITEM_KIND_INFO[k].plural;

/** The real PDF of a library entry (nothing is saved): see `library-preview.ts`. */
export async function previewLibraryPdf(actor: PbActor, libraryId: string): Promise<PbResult<{ pdfBase64: string; pages: number }>> {
  const kind = libraryId.startsWith("sop.") ? "sop" : libraryId.startsWith("kpi.") ? "kpi" : "document";
  const r = await previewLibraryFile(actor, kind, String(libraryId), "pdf");
  return r.ok ? { ok: true, pdfBase64: r.bytes.toString("base64"), pages: r.pages ?? 0 } : r;
}
