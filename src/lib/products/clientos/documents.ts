import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/clientos/db";
import { getApplication } from "@/lib/career-applications";
import { listProjectsForClient } from "@/lib/products/sprintos/projects";
import { listCurrentDocuments, getDocument, serializeDocument } from "@/lib/products/sprintos/documents";
import { putObject, getObject, deleteObject } from "@/lib/storage/blob";
import type { CurrentPortalUser } from "@/lib/portal-auth";

/**
 * The portal "Documents" tab. One `portal_documents` collection holds files staff
 * explicitly share with an external user; everything else (a résumé, a project
 * document) is surfaced *virtually* from its existing ERP store. One authed
 * download route (`/api/clientos/download/[type]/[id]`) covers all sources.
 */

export const PORTAL_DOCS_COLLECTION = "portal_documents";
const FOLDER = "portal-documents";

export interface PortalDocument {
  _id: string;
  ownerUserId: string;
  /** Lead Management link — set when shared from `/dealflow-ai/leads`. */
  leadId: string | null;
  name: string;
  storageKey: string;
  contentType: string;
  size: number;
  category: string;
  uploadedBy: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface PortalDocEntry {
  id: string;
  name: string;
  category: string;
  size: number | null;
  sharedOn: string;
  /** `/api/clientos/download/<type>/<ref>` */
  downloadHref: string;
  source: "staff" | "resume" | "project";
  context: string | null;
}

let idx = false;

async function collection() {
  const db = await getDb();
  const c = db.collection<PortalDocument>(PORTAL_DOCS_COLLECTION);
  if (!idx) {
    idx = true;
    await Promise.all([
      c.createIndex({ ownerUserId: 1, createdAt: -1 }).catch(() => {}),
      c.createIndex({ storageKey: 1 }, { unique: true }).catch(() => {}),
    ]);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Staff upload (used by the seed script + any future staff "share document" UI)
// ---------------------------------------------------------------------------

import { sendActivityChatMessage } from "@/lib/lead-management/activity-notifier";
import { getCompanyBrand } from "@/lib/platform/branding";

export async function sharePortalDocument(
  ownerUserId: string,
  file: File,
  opts: { category?: string; uploadedBy?: string | null; leadId?: string | null } = {}
): Promise<PortalDocument> {
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const key = `${randomUUID()}.${ext}`;
  const { storageKey } = await putObject(FOLDER, key, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
  const doc: PortalDocument = {
    _id: newId(),
    ownerUserId,
    leadId: opts.leadId ?? null,
    name: file.name,
    storageKey,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    category: opts.category ?? "General",
    uploadedBy: opts.uploadedBy ?? null,
    createdAt: new Date(),
    deletedAt: null,
  };
  await (await collection()).insertOne(doc);

  if (opts.leadId) {
    await sendActivityChatMessage({
      leadId: opts.leadId,
      activityType: "document_update",
      title: `Document Uploaded: ${file.name}`,
      details: `A new document (${file.name}) in category "${opts.category ?? "General"}" has been added to your Documents section.`,
      actorStaffId: opts.uploadedBy ?? null,
    });
  }

  return doc;
}

export interface StaffDocRow {
  id: string;
  name: string;
  category: string;
  size: number;
  sharedOn: string;
}

/** Staff-shared docs on a lead's account (for the `/dealflow-ai/leads` Documents product). */
export async function listStaffDocsForUser(ownerUserId: string): Promise<StaffDocRow[]> {
  const c = await collection();
  const rows = await c.find({ ownerUserId, deletedAt: null }).sort({ createdAt: -1 }).toArray();
  return rows.map((d) => ({
    id: d._id,
    name: d.name,
    category: d.category,
    size: d.size,
    sharedOn: d.createdAt.toISOString(),
  }));
}

export async function deletePortalDocument(id: string, ownerUserId: string): Promise<void> {
  const c = await collection();
  const doc = await c.findOne({ _id: id, ownerUserId });
  if (!doc) return;
  await c.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  await deleteObject(doc.storageKey);
}

export async function readPortalDocStream(storageKey: string) {
  return getObject(storageKey);
}

async function getStaffDoc(id: string): Promise<PortalDocument | null> {
  return (await collection()).findOne({ _id: id, deletedAt: null });
}

// ---------------------------------------------------------------------------
// Aggregated list for the Documents page
// ---------------------------------------------------------------------------

export async function listPortalDocuments(user: CurrentPortalUser): Promise<PortalDocEntry[]> {
  const entries: PortalDocEntry[] = [];

  const staff = await (await collection()).find({ ownerUserId: user.id, deletedAt: null }).sort({ createdAt: -1 }).toArray();
  for (const d of staff) {
    entries.push({
      id: d._id,
      name: d.name,
      category: d.category,
      size: d.size,
      sharedOn: d.createdAt.toISOString(),
      downloadHref: `/api/clientos/download/staff/${d._id}`,
      source: "staff",
      context: `Shared by ${(await getCompanyBrand()).name}`,
    });
  }

  if (user.role === "job_applicant" && user.applicationId) {
    const app = await getApplication(user.applicationId).catch(() => null);
    if (app?.resume?.storageKey) {
      entries.push({
        id: `resume-${user.applicationId}`,
        name: app.resume.filename || "Resume.pdf",
        category: "Application",
        size: app.resume.size ?? null,
        sharedOn: app.createdAt.toISOString(),
        downloadHref: `/api/clientos/download/resume/${user.applicationId}`,
        source: "resume",
        context: "Your submitted résumé",
      });
    }
  }

  if (user.role === "client" && user.clientId) {
    const projects = await listProjectsForClient(user.clientId).catch(() => []);
    for (const p of projects) {
      const docs = await listCurrentDocuments(p._id).catch(() => []);
      for (const raw of docs) {
        const d = serializeDocument(raw);
        entries.push({
          id: d._id,
          name: d.title || d.filename,
          category: String(d.category ?? "Project"),
          size: d.size ?? null,
          sharedOn: d.createdAt,
          downloadHref: `/api/clientos/download/project/${d._id}`,
          source: "project",
          context: p.name,
        });
      }
    }
  }

  return entries.sort((a, b) => b.sharedOn.localeCompare(a.sharedOn));
}

// ---------------------------------------------------------------------------
// Download authorization — one gate per source type
// ---------------------------------------------------------------------------

export interface DownloadTarget {
  stream: ReadableStream<Uint8Array>;
  filename: string;
  contentType: string;
}

export async function resolvePortalDownload(
  user: CurrentPortalUser,
  type: string,
  ref: string
): Promise<DownloadTarget | null> {
  if (type === "staff") {
    const d = await getStaffDoc(ref);
    if (!d || d.ownerUserId !== user.id) return null;
    const result = await readPortalDocStream(d.storageKey);
    return result ? { stream: result.stream, filename: d.name, contentType: d.contentType } : null;
  }

  if (type === "resume") {
    if (user.role !== "job_applicant" || user.applicationId !== ref) return null;
    const app = await getApplication(ref).catch(() => null);
    if (!app?.resume?.storageKey) return null;
    const { readResumeFile } = await import("@/lib/resume-storage");
    const result = await readResumeFile(app.resume.storageKey);
    if (!result) return null;
    return { stream: result.stream, filename: app.resume.filename || "Resume", contentType: app.resume.contentType || "application/pdf" };
  }

  if (type === "project") {
    if (user.role !== "client" || !user.clientId) return null;
    const doc = await getDocument(ref).catch(() => null);
    if (!doc) return null;
    const projects = await listProjectsForClient(user.clientId).catch(() => []);
    if (!projects.some((p) => p._id === doc.projectId)) return null;
    const { readDocumentStream } = await import("@/lib/products/sprintos/document-storage");
    const result = await readDocumentStream(doc.storageKey);
    if (!result) return null;
    return { stream: result.stream, filename: doc.filename, contentType: doc.contentType || "application/octet-stream" };
  }

  return null;
}
