import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, newId, createStamp, updateStamp, notDeleted, nextSequence, todayIso, addDaysIso, cleanIsoDate } from "@/lib/products/playbook-ai/db";
import {
  LIVE_STATUSES,
  isConfidentiality,
  isSopPriority,
  type Confidentiality,
  type SopContent,
  type SopPriority,
  type SopStatus,
} from "@/lib/products/playbook-ai/constants";
import { deriveStatus } from "@/lib/products/playbook-ai/lifecycle";
import {
  canArchiveSop,
  canCreateInDepartment,
  canDeleteDraftSop,
  canEditSop,
  canGrantAccess,
  canPublishSop,
  canReadSop,
  canRestoreSop,
  toAccessDoc,
} from "@/lib/products/playbook-ai/access";
import { cleanText, emptyContent, referencedFileIds, validateContent, nextVersion } from "@/lib/products/playbook-ai/content";
import { recordAudit, diffSummary } from "@/lib/products/playbook-ai/audit";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { getTemplate, sectionsFromTemplate } from "@/lib/products/playbook-ai/templates";
import { getSettings } from "@/lib/products/playbook-ai/settings";
import { listHrmsDesignations, userNames } from "@/lib/products/playbook-ai/people";
import { listSopFiles } from "@/lib/products/playbook-ai/files";
import { onNewVersionPublished, autoAssignMandatory } from "@/lib/products/playbook-ai/assignments";
import { notifySopUsers } from "@/lib/products/playbook-ai/notifications";
import type { AssignmentDoc, SopDoc, SopSummary, SopVersionDoc, SopViewer } from "@/lib/products/playbook-ai/types";
import { currentCompanyId } from "@/lib/platform/tenancy/context";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

let indexesEnsured = false;
async function cols() {
  const db = await getDb();
  const sops = db.collection<SopDoc>(COLLECTIONS.sops);
  const versions = db.collection<SopVersionDoc>(COLLECTIONS.versions);
  const assignments = db.collection<AssignmentDoc>(COLLECTIONS.assignments);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      sops.createIndex({ code: 1 }, { unique: true }).catch(() => {}),
      sops.createIndex({ departmentId: 1, status: 1 }).catch(() => {}),
      sops.createIndex({ status: 1, expiryDate: 1 }).catch(() => {}),
      sops.createIndex({ ownerId: 1 }).catch(() => {}),
      sops.createIndex({ authorId: 1 }).catch(() => {}),
      sops.createIndex({ updatedAt: -1 }).catch(() => {}),
      versions.createIndex({ sopId: 1, version: 1 }, { unique: true }).catch(() => {}),
      versions.createIndex({ publishedAt: -1 }).catch(() => {}),
    ]);
  }
  return { db, sops, versions, assignments };
}

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

export function toSummary(d: SopDoc, today: string): SopSummary {
  const body = d.live ?? d.draft;
  return {
    _id: d._id,
    code: d.code,
    title: d.live?.title ?? d.draft.title,
    description: body.description,
    departmentId: d.departmentId,
    functionId: d.functionId,
    processId: d.processId,
    subProcessId: d.subProcessId,
    categoryId: d.categoryId,
    ownerId: d.ownerId,
    authorId: d.authorId,
    createdBy: d.createdBy,
    applicableRoleIds: d.applicableRoleIds,
    effectiveDate: d.effectiveDate,
    reviewDate: d.reviewDate,
    expiryDate: d.expiryDate,
    priority: d.priority,
    confidentiality: d.confidentiality,
    mandatory: d.mandatory,
    allowDownload: d.allowDownload,
    tags: d.tags,
    accessUserIds: d.accessUserIds,
    storedStatus: d.status,
    status: deriveStatus(d.status, d, today),
    version: d.version,
    hasUnpublishedChanges: d.hasUnpublishedChanges,
    moduleTags: Array.from(new Set(body.moduleLinks.map((m) => m.module))),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    publishedAt: d.publishedAt,
  };
}

/** Body sections are large; list views never need them. */
const SUMMARY_PROJECTION = { "live.sections": 0, "draft.sections": 0 } as const;

// ---------------------------------------------------------------------------
// Reads (permission-filtered)
// ---------------------------------------------------------------------------

export async function assignedSopIds(userId: string): Promise<Set<string>> {
  const { assignments } = await cols();
  const rows = await assignments.find({ userId }, { projection: { sopId: 1 } }).toArray();
  return new Set(rows.map((r) => r.sopId));
}

/**
 * Every SOP the viewer may read, as light summaries. A coarse Mongo filter
 * narrows the scan, then the exact `canReadSop` predicate decides — so lists,
 * counts, search and the dashboard can never show more than the detail page
 * would. (An organisation's SOP corpus is hundreds, not millions, so filtering
 * in memory is cheap and keeps one authoritative rule.)
 */
export async function listVisibleSummaries(v: SopViewer): Promise<SopSummary[]> {
  await sweepStatuses();
  const { sops } = await cols();
  const today = todayIso();
  const assigned = await assignedSopIds(v.userId);

  const filter: Record<string, unknown> = { ...notDeleted };
  if (!v.isAdmin) {
    filter.$or = [
      { status: { $in: [...LIVE_STATUSES] } },
      { ownerId: v.userId },
      { authorId: v.userId },
      { createdBy: v.userId },
      ...(v.manageDepartmentIds.length ? [{ departmentId: { $in: v.manageDepartmentIds } }] : []),
    ];
  }
  const docs = await sops.find(filter, { projection: SUMMARY_PROJECTION }).sort({ updatedAt: -1 }).toArray();
  return docs.filter((d) => canReadSop(v, toAccessDoc(d, today), assigned.has(d._id))).map((d) => toSummary(d, today));
}

/** A single SOP the viewer may read, or null (never reveals whether it exists). */
export async function getReadableSop(v: SopViewer, id: string): Promise<{ doc: SopDoc; assigned: boolean; status: SopStatus } | null> {
  const { sops, assignments } = await cols();
  const doc = await sops.findOne({ _id: id, ...notDeleted });
  if (!doc) return null;
  const assigned = !!(await assignments.findOne({ sopId: id, userId: v.userId }, { projection: { _id: 1 } }));
  const today = todayIso();
  if (!canReadSop(v, toAccessDoc(doc, today), assigned)) return null;
  return { doc, assigned, status: deriveStatus(doc.status, doc, today) };
}

export async function listVersions(sopId: string): Promise<SopVersionDoc[]> {
  const { versions } = await cols();
  const all = await versions.find({ sopId }).toArray();
  // Numeric compare so 1.10 sorts after 1.9.
  return all.sort((a, b) => {
    const [am, an] = a.version.split(".").map(Number);
    const [bm, bn] = b.version.split(".").map(Number);
    return bm - am || bn - an;
  });
}

export async function getVersion(sopId: string, version: string): Promise<SopVersionDoc | null> {
  const { versions } = await cols();
  return versions.findOne({ sopId, version });
}

/** Options for the "related SOPs" picker: only SOPs the viewer can read. */
export async function relatedSopOptions(v: SopViewer, excludeId?: string): Promise<{ id: string; code: string; title: string }[]> {
  const list = await listVisibleSummaries(v);
  return list.filter((s) => s._id !== excludeId && s.storedStatus !== "archived").map((s) => ({ id: s._id, code: s.code, title: s.title }));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createSop(
  v: SopViewer,
  input: { title: string; departmentId: string; templateId?: string | null; functionId?: string | null; processId?: string | null; categoryId?: string | null }
): Promise<Result<{ id: string; code: string }>> {
  const title = cleanText(input.title, 200).trim();
  if (!title) return { ok: false, error: "Enter a title for the SOP." };
  const tax = await getTaxonomy();
  const dept = tax.departments.find((d) => d._id === input.departmentId && d.active);
  if (!dept) return { ok: false, error: "Choose an active department." };
  if (!canCreateInDepartment(v, dept._id)) return { ok: false, error: `You can't create SOPs in ${dept.name}.` };

  const fn = input.functionId ? tax.functions.find((f) => f._id === input.functionId && f.departmentId === dept._id) : null;
  const proc = input.processId && fn ? tax.processes.find((p) => p._id === input.processId && p.functionId === fn._id && !p.parentId) : null;
  const category = input.categoryId ? tax.categories.find((c) => c._id === input.categoryId) : null;
  const template = input.templateId ? await getTemplate(input.templateId) : null;
  const settings = await getSettings();

  const { sops } = await cols();
  const seq = await nextSequence(`sop_${dept.code}`);
  const code = `SOP-${dept.code}-${String(seq).padStart(4, "0")}`;

  const draft: SopContent = { ...emptyContent(title), sections: template ? sectionsFromTemplate(template) : [] };
  const doc: SopDoc = {
    _id: newId(),
    code,
    title,
    departmentId: dept._id,
    functionId: fn?._id ?? null,
    processId: proc?._id ?? null,
    subProcessId: null,
    categoryId: category?._id ?? null,
    ownerId: v.userId,
    authorId: v.userId,
    applicableRoleIds: [],
    effectiveDate: null,
    reviewDate: null,
    expiryDate: null,
    priority: "medium",
    confidentiality: "internal",
    mandatory: false,
    allowDownload: settings.defaultAllowDownload,
    tags: [],
    accessUserIds: [],
    templateId: template?._id ?? null,
    templateName: template?.name ?? null,
    status: "draft",
    version: null,
    publishedAt: null,
    lastPublishedBy: null,
    live: null,
    draft,
    hasUnpublishedChanges: true,
    archivedAt: null,
    archivedBy: null,
    statusBeforeArchive: null,
    ...createStamp(v.userId),
  };
  await sops.insertOne(doc);
  await recordAudit({
    actorId: v.userId,
    actorEmail: v.email,
    action: "create",
    entity: "sop",
    entityId: doc._id,
    entityLabel: `${code} · ${title}`,
    summary: `Created draft in ${dept.name}${template ? ` from template "${template.name}"` : ""}`,
  });
  return { ok: true, id: doc._id, code };
}

// ---------------------------------------------------------------------------
// Save (metadata + draft body)
// ---------------------------------------------------------------------------

export interface SopMetaInput {
  departmentId: string;
  functionId: string | null;
  processId: string | null;
  subProcessId: string | null;
  categoryId: string | null;
  ownerId: string;
  applicableRoleIds: string[];
  effectiveDate: string | null;
  reviewDate: string | null;
  expiryDate: string | null;
  priority: SopPriority;
  confidentiality: Confidentiality;
  mandatory: boolean;
  allowDownload: boolean;
  tags: string[];
  accessUserIds: string[];
}

function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const t of v) {
    const tag = cleanText(t, 40).trim().toLowerCase().replace(/\s+/g, "-");
    if (tag) out.add(tag);
    if (out.size >= 20) break;
  }
  return Array.from(out);
}

export async function saveSop(
  v: SopViewer,
  id: string,
  input: { baseUpdatedAt: string; meta: unknown; content: unknown }
): Promise<Result<{ updatedAt: string; hasUnpublishedChanges: boolean }>> {
  const found = await getReadableSop(v, id);
  if (!found) return { ok: false, error: "SOP not found." };
  const doc = found.doc;
  const acc = toAccessDoc(doc, todayIso());
  if (!canEditSop(v, acc)) return { ok: false, error: "You don't have permission to edit this SOP." };

  if (new Date(input.baseUpdatedAt).getTime() !== doc.updatedAt.getTime()) {
    return { ok: false, error: "This SOP was changed by someone else since you opened it. Reload to get the latest, then re-apply your edits." };
  }

  const m = (input.meta ?? {}) as Record<string, unknown>;
  const tax = await getTaxonomy();

  // --- taxonomy ---------------------------------------------------------
  const departmentId = typeof m.departmentId === "string" ? m.departmentId : doc.departmentId;
  const dept = tax.departments.find((d) => d._id === departmentId);
  if (!dept) return { ok: false, error: "Unknown department." };
  if (departmentId !== doc.departmentId) {
    if (!dept.active) return { ok: false, error: "That department is inactive." };
    if (!canCreateInDepartment(v, departmentId)) return { ok: false, error: `You can't move SOPs into ${dept.name}.` };
  }
  const functionId = typeof m.functionId === "string" && m.functionId ? m.functionId : null;
  const fn = functionId ? tax.functions.find((f) => f._id === functionId) : null;
  if (functionId && (!fn || fn.departmentId !== departmentId)) return { ok: false, error: "That function does not belong to the chosen department." };
  const processId = typeof m.processId === "string" && m.processId ? m.processId : null;
  const proc = processId ? tax.processes.find((p) => p._id === processId) : null;
  if (processId && (!proc || proc.parentId || proc.functionId !== functionId)) return { ok: false, error: "That process does not belong to the chosen function." };
  const subProcessId = typeof m.subProcessId === "string" && m.subProcessId ? m.subProcessId : null;
  const sub = subProcessId ? tax.processes.find((p) => p._id === subProcessId) : null;
  if (subProcessId && (!sub || sub.parentId !== processId)) return { ok: false, error: "That sub-process does not belong to the chosen process." };
  const categoryId = typeof m.categoryId === "string" && m.categoryId ? m.categoryId : null;
  if (categoryId && !tax.categories.some((c) => c._id === categoryId)) return { ok: false, error: "Unknown category." };

  // --- people -----------------------------------------------------------
  const ownerId = typeof m.ownerId === "string" && m.ownerId ? m.ownerId : doc.ownerId;
  if (ownerId !== doc.ownerId) {
    if (!ObjectId.isValid(ownerId) || !(await userNames([ownerId])).has(ownerId)) return { ok: false, error: "The chosen owner does not exist." };
  }
  let applicableRoleIds: string[] = doc.applicableRoleIds;
  if (Array.isArray(m.applicableRoleIds)) {
    const designations = new Set((await listHrmsDesignations()).map((d) => d._id));
    applicableRoleIds = Array.from(new Set(m.applicableRoleIds.filter((x): x is string => typeof x === "string" && designations.has(x))));
  }
  let accessUserIds = doc.accessUserIds;
  if (Array.isArray(m.accessUserIds)) {
    const wanted = Array.from(new Set(m.accessUserIds.filter((x): x is string => typeof x === "string" && ObjectId.isValid(x)))).slice(0, 200);
    const changed = JSON.stringify([...wanted].sort()) !== JSON.stringify([...doc.accessUserIds].sort());
    if (changed) {
      if (!canGrantAccess(v, acc)) return { ok: false, error: "You can't change who has explicit access to this SOP." };
      const known = await userNames(wanted);
      accessUserIds = wanted.filter((u) => known.has(u));
    }
  }

  // --- scalars ----------------------------------------------------------
  const effectiveDate = m.effectiveDate ? cleanIsoDate(m.effectiveDate) : null;
  const reviewDate = m.reviewDate ? cleanIsoDate(m.reviewDate) : null;
  const expiryDate = m.expiryDate ? cleanIsoDate(m.expiryDate) : null;
  if ((m.effectiveDate && !effectiveDate) || (m.reviewDate && !reviewDate) || (m.expiryDate && !expiryDate)) return { ok: false, error: "Enter valid dates." };
  if (effectiveDate && expiryDate && expiryDate < effectiveDate) return { ok: false, error: "The expiry date can't be before the effective date." };
  const priority = isSopPriority(m.priority) ? m.priority : doc.priority;
  const confidentiality = isConfidentiality(m.confidentiality) ? m.confidentiality : doc.confidentiality;
  const mandatory = typeof m.mandatory === "boolean" ? m.mandatory : doc.mandatory;
  const allowDownload = typeof m.allowDownload === "boolean" ? m.allowDownload : doc.allowDownload;
  const tags = m.tags !== undefined ? cleanTags(m.tags) : doc.tags;

  // --- body -------------------------------------------------------------
  const files = await listSopFiles(id);
  const parsed = validateContent(input.content, new Set(files.map((f) => f._id)));
  if (!parsed.ok) return parsed;
  const content = parsed.content;
  if (content.relatedSopIds.length) {
    const readable = new Set((await listVisibleSummaries(v)).map((s) => s._id));
    content.relatedSopIds = content.relatedSopIds.filter((r) => r !== id && readable.has(r));
  }

  const meta: SopMetaInput = {
    departmentId, functionId, processId, subProcessId, categoryId, ownerId, applicableRoleIds,
    effectiveDate, reviewDate, expiryDate, priority, confidentiality, mandatory, allowDownload, tags, accessUserIds,
  };

  const hasUnpublishedChanges = doc.live ? JSON.stringify(content) !== JSON.stringify(doc.live) : true;
  const today = todayIso();
  const nextStatus: SopStatus = doc.version && doc.status !== "draft" && doc.status !== "archived" ? deriveStatus("published", { effectiveDate, expiryDate }, today) : doc.status;

  const before: Record<string, unknown> = {
    department: doc.departmentId, function: doc.functionId, process: doc.processId, category: doc.categoryId, owner: doc.ownerId,
    effective: doc.effectiveDate, review: doc.reviewDate, expiry: doc.expiryDate, priority: doc.priority,
    confidentiality: doc.confidentiality, mandatory: doc.mandatory, download: doc.allowDownload, tags: doc.tags,
    access: doc.accessUserIds.length, roles: doc.applicableRoleIds.length, status: doc.status,
  };
  const after: Record<string, unknown> = {
    department: departmentId, function: functionId, process: processId, category: categoryId, owner: ownerId,
    effective: effectiveDate, review: reviewDate, expiry: expiryDate, priority, confidentiality, mandatory, download: allowDownload, tags,
    access: accessUserIds.length, roles: applicableRoleIds.length, status: nextStatus,
  };
  const metaDiff = diffSummary(before, after, Object.keys(before));
  const contentChanged = JSON.stringify(content) !== JSON.stringify(doc.draft);

  const { sops } = await cols();
  const now = new Date();
  const res = await sops.findOneAndUpdate(
    { _id: id, updatedAt: doc.updatedAt, ...notDeleted },
    {
      $set: {
        ...meta,
        draft: content,
        status: nextStatus,
        hasUnpublishedChanges,
        title: doc.live ? doc.live.title : content.title,
        updatedAt: now,
        updatedBy: v.userId,
      },
    },
    { returnDocument: "after" }
  );
  if (!res) return { ok: false, error: "This SOP was changed by someone else while saving. Reload and try again." };

  if (metaDiff || contentChanged) {
    await recordAudit({
      actorId: v.userId,
      actorEmail: v.email,
      action: "edit",
      entity: "sop",
      entityId: id,
      entityLabel: `${doc.code} · ${content.title}`,
      summary: [contentChanged ? "Draft content edited" : null, metaDiff].filter(Boolean).join(" · "),
    });
  }
  return { ok: true, updatedAt: res.updatedAt.toISOString(), hasUnpublishedChanges };
}

// ---------------------------------------------------------------------------
// Publish — direct, no approval step
// ---------------------------------------------------------------------------

function hasBody(c: SopContent): boolean {
  return c.sections.some((s) =>
    s.blocks.some((b) => {
      switch (b.type) {
        case "paragraph":
        case "heading":
        case "note":
        case "warning":
        case "example":
        case "reference":
          return b.text.trim().length > 0;
        case "steps":
        case "bullets":
          return b.items.some((i) => i.trim());
        case "table":
          return b.rows.length > 0;
        case "checklist":
          return b.items.some((i) => i.text.trim());
        case "link":
          return !!b.url;
        case "image":
        case "attachment":
          return !!b.fileId;
        case "video":
          return !!(b.fileId || b.url);
      }
    })
  );
}

export async function publishSop(
  v: SopViewer,
  id: string,
  input: { changeType: "minor" | "major"; changeSummary: string; requireReack: boolean; reackDueDate?: string | null }
): Promise<Result<{ version: string; status: SopStatus }>> {
  const found = await getReadableSop(v, id);
  if (!found) return { ok: false, error: "SOP not found." };
  const doc = found.doc;
  if (!canPublishSop(v, toAccessDoc(doc, todayIso()))) return { ok: false, error: "You don't have permission to publish this SOP." };

  const draft = doc.draft;
  const isFirst = !doc.version;
  if (!draft.purpose.trim()) return { ok: false, error: "Add a purpose before publishing." };
  if (!draft.scope.trim()) return { ok: false, error: "Add a scope before publishing." };
  if (!hasBody(draft)) return { ok: false, error: "Add some procedure content before publishing." };
  if (!isFirst && !doc.hasUnpublishedChanges) return { ok: false, error: "There are no unpublished changes to publish." };

  const changeSummary = cleanText(input.changeSummary, 1000).trim() || (isFirst ? "Initial release" : "");
  if (!isFirst && changeSummary.length < 3) return { ok: false, error: "Describe what changed in this version." };

  const changeType = isFirst ? "initial" : input.changeType === "major" ? "major" : "minor";
  const version = nextVersion(doc.version, input.changeType === "major" ? "major" : "minor");

  const settings = await getSettings();
  const today = todayIso();
  const effectiveDate = doc.effectiveDate ?? today;
  const reviewDate = doc.reviewDate ?? (() => {
    const d = new Date(`${today}T00:00:00`);
    d.setMonth(d.getMonth() + settings.defaultReviewMonths);
    return todayIso(d);
  })();
  const expiryDate = doc.expiryDate;
  if (expiryDate && expiryDate < today) return { ok: false, error: "The expiry date has already passed — extend it before publishing." };
  const status = deriveStatus("published", { effectiveDate, expiryDate }, today);

  const { sops, versions } = await cols();
  const names = await userNames([v.userId]);
  const versionDoc: SopVersionDoc = {
    _id: newId(),
    sopId: id,
    code: doc.code,
    version,
    previousVersion: doc.version,
    changeType,
    changeSummary,
    authorId: v.userId,
    authorName: names.get(v.userId) ?? v.name,
    publishedAt: new Date(),
    content: draft,
    meta: {
      departmentId: doc.departmentId,
      functionId: doc.functionId,
      processId: doc.processId,
      categoryId: doc.categoryId,
      ownerId: doc.ownerId,
      confidentiality: doc.confidentiality,
      priority: doc.priority,
      mandatory: doc.mandatory,
      tags: doc.tags,
      effectiveDate,
      reviewDate,
      expiryDate,
    },
  };
  try {
    // The unique (sopId, version) index makes a concurrent double-publish fail here instead of overwriting.
    await versions.insertOne(versionDoc);
  } catch {
    return { ok: false, error: "Someone else just published this SOP. Reload to see the latest version." };
  }

  const res = await sops.findOneAndUpdate(
    { _id: id, version: doc.version, ...notDeleted },
    {
      $set: {
        live: draft,
        title: draft.title,
        version,
        status,
        effectiveDate,
        reviewDate,
        hasUnpublishedChanges: false,
        publishedAt: versionDoc.publishedAt,
        lastPublishedBy: v.userId,
        archivedAt: null,
        archivedBy: null,
        statusBeforeArchive: null,
        ...updateStamp(v.userId),
      },
    },
    { returnDocument: "after" }
  );
  if (!res) {
    await versions.deleteOne({ _id: versionDoc._id }); // compensate: the publish lost a race, leave no orphan version
    return { ok: false, error: "Someone else changed this SOP while you were publishing. Reload and try again." };
  }

  await recordAudit({
    actorId: v.userId,
    actorEmail: v.email,
    action: isFirst ? "publish" : "update",
    entity: "sop",
    entityId: id,
    entityLabel: `${doc.code} · ${draft.title}`,
    summary: `${isFirst ? "Published" : "New version"} v${version}${doc.version ? ` (from v${doc.version})` : ""} — ${changeSummary}`,
    metadata: { version, previousVersion: doc.version, changeType, requireReack: input.requireReack },
  });

  // Follow-ups never fail the publish: the version is already live.
  try {
    if (isFirst) {
      if (doc.mandatory) await autoAssignMandatory(res, v);
    } else {
      await onNewVersionPublished(res, version, changeSummary, { requireReack: input.requireReack, dueDate: cleanIsoDate(input.reackDueDate) ?? addDaysIso(today, settings.defaultDueDays) }, v);
    }
  } catch {
    // assignments can be re-run from the SOP page
  }
  return { ok: true, version, status };
}

// ---------------------------------------------------------------------------
// Archive / restore / discard / revert
// ---------------------------------------------------------------------------

export async function archiveSop(v: SopViewer, id: string): Promise<Result> {
  const found = await getReadableSop(v, id);
  if (!found) return { ok: false, error: "SOP not found." };
  if (!canArchiveSop(v, toAccessDoc(found.doc, todayIso()))) return { ok: false, error: "You don't have permission to archive this SOP." };
  const { sops } = await cols();
  await sops.updateOne(
    { _id: id },
    { $set: { status: "archived", statusBeforeArchive: found.doc.status, archivedAt: new Date(), archivedBy: v.userId, ...updateStamp(v.userId) } }
  );
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "archive", entity: "sop", entityId: id, entityLabel: `${found.doc.code} · ${found.doc.title}`, summary: "Archived" });
  return { ok: true };
}

export async function restoreSop(v: SopViewer, id: string): Promise<Result<{ status: SopStatus }>> {
  const found = await getReadableSop(v, id);
  if (!found) return { ok: false, error: "SOP not found." };
  const doc = found.doc;
  if (!canRestoreSop(v, toAccessDoc(doc, todayIso()))) return { ok: false, error: "You don't have permission to restore this SOP." };
  const status: SopStatus = doc.version ? deriveStatus("published", doc, todayIso()) : "draft";
  const { sops } = await cols();
  await sops.updateOne({ _id: id }, { $set: { status, archivedAt: null, archivedBy: null, statusBeforeArchive: null, ...updateStamp(v.userId) } });
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "restore", entity: "sop", entityId: id, entityLabel: `${doc.code} · ${doc.title}`, summary: `Restored as ${status}` });
  return { ok: true, status };
}

export async function deleteDraftSop(v: SopViewer, id: string): Promise<Result> {
  const found = await getReadableSop(v, id);
  if (!found) return { ok: false, error: "SOP not found." };
  if (!canDeleteDraftSop(v, toAccessDoc(found.doc, todayIso()))) return { ok: false, error: "Only a never-published draft can be discarded (archive published SOPs instead)." };
  const { sops } = await cols();
  await sops.updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(v.userId) } });
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "sop", entityId: id, entityLabel: `${found.doc.code} · ${found.doc.title}`, summary: "Discarded draft" });
  return { ok: true };
}

/** Loads a past version's body into the working draft (history is untouched; publish creates a NEW version). */
export async function revertDraftToVersion(v: SopViewer, id: string, version: string): Promise<Result> {
  const found = await getReadableSop(v, id);
  if (!found) return { ok: false, error: "SOP not found." };
  if (!canEditSop(v, toAccessDoc(found.doc, todayIso()))) return { ok: false, error: "You don't have permission to edit this SOP." };
  const target = await getVersion(id, version);
  if (!target) return { ok: false, error: "Version not found." };
  const { sops } = await cols();
  const live = found.doc.live;
  await sops.updateOne(
    { _id: id },
    { $set: { draft: target.content, hasUnpublishedChanges: live ? JSON.stringify(target.content) !== JSON.stringify(live) : true, title: live ? live.title : target.content.title, ...updateStamp(v.userId) } }
  );
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "revert", entity: "sop", entityId: id, entityLabel: `${found.doc.code} · ${found.doc.title}`, summary: `Loaded v${version} into the draft` });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Date-driven status transitions
// ---------------------------------------------------------------------------

const lastSweep = new Map<string, number>();

/** Persists published→active and →expired transitions. Idempotent; throttled (per company) so list loads stay cheap. */
export async function sweepStatuses(force = false): Promise<number> {
  const companyId = await currentCompanyId();
  if (!force && Date.now() - (lastSweep.get(companyId) ?? 0) < 5 * 60_000) return 0;
  lastSweep.set(companyId, Date.now());
  const { sops } = await cols();
  const today = todayIso();
  const candidates = await sops
    .find(
      {
        ...notDeleted,
        $or: [
          { status: { $in: ["published", "active"] }, expiryDate: { $lt: today, $ne: null } },
          { status: "published", $or: [{ effectiveDate: null }, { effectiveDate: { $lte: today } }] },
          { status: "expired", $or: [{ expiryDate: null }, { expiryDate: { $gte: today } }] },
        ],
      },
      { projection: SUMMARY_PROJECTION }
    )
    .toArray();
  let changed = 0;
  for (const d of candidates) {
    const next: SopStatus = d.version ? deriveStatus("published", d, today) : d.status;
    if (next === d.status) continue;
    await sops.updateOne({ _id: d._id, status: d.status }, { $set: { status: next } });
    changed += 1;
    await recordAudit({
      actorId: "system",
      actorEmail: "system",
      action: "status_auto",
      entity: "sop",
      entityId: d._id,
      entityLabel: `${d.code} · ${d.title}`,
      summary: `Status ${d.status} → ${next} (date-driven)`,
    });
    if (next === "expired") {
      await notifySopUsers([d.ownerId], {
        type: "sop_expiring",
        title: `${d.code} has expired`,
        body: `"${d.title}" passed its expiry date. Update it and publish a new version, or archive it.`,
        link: `/playbook-ai/library/${d._id}`,
        dedupeKey: `sop-expired:${d._id}:${d.expiryDate}`,
      });
    }
  }
  return changed;
}
