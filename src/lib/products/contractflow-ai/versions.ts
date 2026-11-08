import 'server-only';
import { getLpmsDocumentVersionsCollection } from '@/lib/products/contractflow-ai/db';
import { currentCompanyId } from '@/lib/platform/tenancy/context';
import type { LpmsViewer, DocumentVersionDoc } from '@/lib/products/contractflow-ai/types';
import { logLpmsEvent } from './audit';
import { getDocument, updateDocument } from './documents';

export async function createVersion(documentId: string, changeNote: string, viewer: LpmsViewer): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  const doc = await getDocument(documentId, viewer);
  if (!doc) return { ok: false, error: 'Document not found' };

  const collection = await getLpmsDocumentVersionsCollection();
  
  // Find current max version
  const latestVersion = await collection.findOne(
    { companyId, documentId },
    { sort: { versionNumber: -1 } }
  );
  
  const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

  await collection.insertOne({
    companyId,
    documentId,
    versionNumber,
    blocks: doc.blocks,
    headerBlocks: doc.headerBlocks,
    footerBlocks: doc.footerBlocks,
    fieldValues: doc.fieldValues,
    selectedEntities: doc.selectedEntities,
    changeNote,
    createdAt: new Date().toISOString(),
    createdBy: viewer.userId,
  } as any);

  await logLpmsEvent({
    action: 'CREATE_VERSION',
    entityType: 'DOCUMENT_VERSION',
    entityId: `${documentId}_v${versionNumber}`,
    data: { documentId, versionNumber, changeNote },
    viewer
  });

  return { ok: true, version: versionNumber };
}

export async function listVersions(documentId: string, viewer: LpmsViewer): Promise<DocumentVersionDoc[]> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsDocumentVersionsCollection();
  const versions = await collection.find({ companyId, documentId }).sort({ versionNumber: -1 }).toArray();
  
  return versions.map(v => ({
    ...v,
    _id: v._id.toString(),
    id: v._id.toString()
  })) as any;
}

export async function getVersion(documentId: string, versionNumber: number, viewer: LpmsViewer): Promise<DocumentVersionDoc | null> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsDocumentVersionsCollection();
  const doc = await collection.findOne({ companyId, documentId, versionNumber });
  if (!doc) return null;
  
  return { ...doc, _id: doc._id.toString(), id: doc._id.toString() } as any;
}

export async function restoreVersion(documentId: string, versionNumber: number, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  const version = await getVersion(documentId, versionNumber, viewer);
  if (!version) return { ok: false, error: 'Version not found' };

  const updateResult = await updateDocument(documentId, {
    blocks: version.blocks,
    headerBlocks: version.headerBlocks,
    footerBlocks: version.footerBlocks,
    fieldValues: version.fieldValues || {},
    selectedEntities: version.selectedEntities || {},
  }, viewer);

  if (!updateResult.ok) return updateResult;

  await logLpmsEvent({
    action: 'RESTORE_VERSION',
    entityType: 'DOCUMENT',
    entityId: documentId,
    data: { restoredVersion: versionNumber },
    viewer
  });

  return { ok: true };
}
