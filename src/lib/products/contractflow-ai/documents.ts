import { lpmsEvents } from "@/lib/notify/triggers/lpms";
import 'server-only';
import { getLpmsDocumentsCollection, getLpmsApprovalsCollection } from '@/lib/products/contractflow-ai/db';
import { currentCompanyId } from '@/lib/platform/tenancy/context';
import type { LpmsViewer, DocumentDoc } from '@/lib/products/contractflow-ai/types';
import { logLpmsEvent } from './audit';
import { ObjectId } from 'mongodb';
import { generateDocumentNumber } from './makers';
import { resolveVariables, detectBlockVariables } from './variables';
import { createVersion } from './versions';

export async function createDocument(
  data: { makerTypeId: string; templateId?: string; title: string; fieldValues?: any; selectedEntities?: any; isAiGenerated?: boolean; aiPrompt?: string },
  viewer: LpmsViewer
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_author') && !viewer.roles.includes('lpms_admin')) {
    return { ok: false, error: 'Unauthorized (requires CREATE)' };
  }

  const docNumber = await generateDocumentNumber(data.makerTypeId, companyId);
  const collection = await getLpmsDocumentsCollection();
  
  const result = await collection.insertOne({
    companyId,
    makerTypeId: data.makerTypeId,
    templateId: data.templateId || undefined,
    title: data.title,
    documentNumber: docNumber,
    status: 'draft',
    fieldValues: data.fieldValues || {},
    selectedEntities: data.selectedEntities || {},
    isAiGenerated: data.isAiGenerated || false,
    aiPrompt: data.aiPrompt,
    blocks: [],
    headerBlocks: [],
    footerBlocks: [],
    createdAt: new Date().toISOString(),
    createdBy: viewer.userId,
    ownerId: viewer.userId,
  } as any);

  const id = result.insertedId.toString();

  await createVersion(id, 'Initial draft', viewer);

  await logLpmsEvent({
    action: 'CREATE',
    entityType: 'DOCUMENT',
    entityId: id,
    entityLabel: data.title,
    viewer
  });

  return { ok: true, id };
}

export async function updateDocument(
  id: string,
  data: { blocks?: any[]; headerBlocks?: any[]; footerBlocks?: any[]; title?: string; fieldValues?: any; selectedEntities?: any },
  viewer: LpmsViewer
): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  const collection = await getLpmsDocumentsCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) as any, companyId });
  if (!doc) return { ok: false, error: 'Document not found' };

  if (doc.status !== 'draft' && doc.status !== 'review') {
    return { ok: false, error: 'Document cannot be edited in current status' };
  }

  await collection.updateOne(
    { _id: new ObjectId(id) as any, companyId },
    { $set: { ...data, updatedAt: new Date().toISOString(), updatedBy: viewer.userId } as any }
  );

  await logLpmsEvent({
    action: 'UPDATE',
    entityType: 'DOCUMENT',
    entityId: id,
    viewer
  });

  return { ok: true };
}

export async function getDocument(id: string, viewer: LpmsViewer): Promise<DocumentDoc | null> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsDocumentsCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) as any, companyId });
  if (!doc) return null;
  return { ...doc, _id: doc._id.toString(), id: doc._id.toString() } as any;
}

export async function listDocuments(
  opts: { makerTypeId?: string; status?: string; category?: string; search?: string; page?: number; pageSize?: number },
  viewer: LpmsViewer
): Promise<{ items: DocumentDoc[]; total: number }> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsDocumentsCollection();
  const filter: any = { companyId };
  
  if (opts.makerTypeId) filter.makerTypeId = opts.makerTypeId;
  if (opts.status) filter.status = opts.status;
  if (opts.search) filter.title = { $regex: opts.search, $options: 'i' };

  const page = opts.page || 1;
  const pageSize = opts.pageSize || 20;
  const skip = (page - 1) * pageSize;

  const items = await collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray();
  const total = await collection.countDocuments(filter);

  return { 
    items: items.map(c => ({ ...c, _id: c._id.toString(), id: c._id.toString() })) as any,
    total 
  };
}

export async function submitForReview(id: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const collection = await getLpmsDocumentsCollection();
  const doc = await getDocument(id, viewer);
  if (!doc) return { ok: false, error: 'Not found' };
  
  await collection.updateOne({ _id: new ObjectId(id) as any }, { $set: { status: 'review' } as any });
  
  await logLpmsEvent({ action: 'STATUS_CHANGE', entityType: 'DOCUMENT', entityId: id, data: { status: 'review' }, viewer });
  await lpmsEvents.submittedForReview(id, viewer.userId);
  return { ok: true };
}

export async function submitForApproval(id: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  const collection = await getLpmsDocumentsCollection();
  await collection.updateOne({ _id: new ObjectId(id) as any }, { $set: { status: 'pending_approval' } as any });
  
  const approvalsCol = await getLpmsApprovalsCollection();
  await approvalsCol.insertOne({
    companyId,
    documentId: id,
    status: 'pending',
    role: 'lpms_manager',
    createdAt: new Date().toISOString()
  } as any);

  await logLpmsEvent({ action: 'STATUS_CHANGE', entityType: 'DOCUMENT', entityId: id, data: { status: 'pending_approval' }, viewer });
  await lpmsEvents.submittedForApproval(id, viewer.userId);
  return { ok: true };
}

export async function approveDocument(documentId: string, approvalId: string, notes: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const approvalsCol = await getLpmsApprovalsCollection();
  await approvalsCol.updateOne(
    { _id: new ObjectId(approvalId) as any },
    { $set: { status: 'approved', notes, actionBy: viewer.userId, actionAt: new Date().toISOString() } as any }
  );

  const collection = await getLpmsDocumentsCollection();
  await collection.updateOne({ _id: new ObjectId(documentId) as any }, { $set: { status: 'approved' } as any });

  await logLpmsEvent({ action: 'APPROVE', entityType: 'DOCUMENT', entityId: documentId, viewer });
  await lpmsEvents.decided(documentId, 'approved', notes, viewer.userId);
  return { ok: true };
}

export async function rejectDocument(documentId: string, approvalId: string, notes: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const approvalsCol = await getLpmsApprovalsCollection();
  await approvalsCol.updateOne(
    { _id: new ObjectId(approvalId) as any },
    { $set: { status: 'rejected', notes, actionBy: viewer.userId, actionAt: new Date().toISOString() } as any }
  );

  const collection = await getLpmsDocumentsCollection();
  await collection.updateOne({ _id: new ObjectId(documentId) as any }, { $set: { status: 'rejected' } as any });

  await logLpmsEvent({ action: 'REJECT', entityType: 'DOCUMENT', entityId: documentId, viewer });
  await lpmsEvents.decided(documentId, 'rejected', notes, viewer.userId);
  return { ok: true };
}

export async function publishDocument(id: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const collection = await getLpmsDocumentsCollection();
  await collection.updateOne({ _id: new ObjectId(id) as any }, { $set: { status: 'published', publishedAt: new Date().toISOString(), publishedBy: viewer.userId } as any });
  await logLpmsEvent({ action: 'PUBLISH', entityType: 'DOCUMENT', entityId: id, viewer });
  await lpmsEvents.published(id, viewer.userId);
  return { ok: true };
}

export async function activateDocument(id: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const collection = await getLpmsDocumentsCollection();
  await collection.updateOne({ _id: new ObjectId(id) as any }, { $set: { status: 'active', activeAt: new Date().toISOString() } as any });
  await logLpmsEvent({ action: 'ACTIVATE', entityType: 'DOCUMENT', entityId: id, viewer });
  await lpmsEvents.stateChanged(id, 'activated', viewer.userId);
  return { ok: true };
}

export async function archiveDocument(id: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const collection = await getLpmsDocumentsCollection();
  await collection.updateOne({ _id: new ObjectId(id) as any }, { $set: { status: 'archived', archivedAt: new Date().toISOString() } as any });
  await logLpmsEvent({ action: 'ARCHIVE', entityType: 'DOCUMENT', entityId: id, viewer });
  await lpmsEvents.stateChanged(id, 'archived', viewer.userId);
  return { ok: true };
}

export async function deleteDocument(id: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const collection = await getLpmsDocumentsCollection();
  const doc = await getDocument(id, viewer);
  if (doc?.status !== 'draft') return { ok: false, error: 'Only drafts can be deleted' };

  await collection.deleteOne({ _id: new ObjectId(id) as any });
  await logLpmsEvent({ action: 'DELETE', entityType: 'DOCUMENT', entityId: id, viewer });
  return { ok: true };
}

export async function renderDocumentVariables(documentId: string, viewer: LpmsViewer): Promise<Record<string, string>> {
  const doc = await getDocument(documentId, viewer);
  if (!doc) return {};
  
  const allBlocks = [...(doc.blocks || []), ...(doc.headerBlocks || []), ...(doc.footerBlocks || [])];
  const detected = detectBlockVariables(allBlocks);
  const resolved = await resolveVariables(detected, doc.selectedEntities || {}, viewer);
  return resolved;
}
