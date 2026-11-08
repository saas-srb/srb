import 'server-only';
import { getLpmsMakerTypesCollection, getLpmsDocumentsCollection } from '@/lib/products/contractflow-ai/db';
import { currentCompanyId } from '@/lib/platform/tenancy/context';
import type { LpmsViewer, MakerTypeDoc } from '@/lib/products/contractflow-ai/types';
import { logLpmsEvent } from './audit';
import { ObjectId } from 'mongodb';

export async function listMakerTypes(viewer: LpmsViewer): Promise<MakerTypeDoc[]> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsMakerTypesCollection();
  const items = await collection.find({ companyId, archived: { $ne: true } }).toArray();
  return items.map(c => ({
    ...c,
    _id: c._id.toString(),
    id: c._id.toString()
  })) as any;
}

export async function getMakerType(id: string, viewer: LpmsViewer): Promise<MakerTypeDoc | null> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsMakerTypesCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) as any, companyId });
  if (!doc) return null;
  return { ...doc, _id: doc._id.toString(), id: doc._id.toString() } as any;
}

export async function createMakerType(data: any, viewer: LpmsViewer): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager')) {
    return { ok: false, error: 'Unauthorized (requires MANAGE_MAKERS)' };
  }

  const collection = await getLpmsMakerTypesCollection();
  const result = await collection.insertOne({
    companyId,
    ...data,
    archived: false,
    createdAt: new Date().toISOString(),
    createdBy: viewer.userId,
  } as any);

  const id = result.insertedId.toString();

  await logLpmsEvent({
    action: 'CREATE',
    entityType: 'MAKER_TYPE',
    entityId: id,
    entityLabel: data.name,
    viewer
  });

  return { ok: true, id };
}

export async function updateMakerType(id: string, data: any, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager')) {
    return { ok: false, error: 'Unauthorized (requires MANAGE_MAKERS)' };
  }

  const collection = await getLpmsMakerTypesCollection();
  await collection.updateOne(
    { _id: new ObjectId(id) as any, companyId },
    { $set: { ...data, updatedAt: new Date().toISOString(), updatedBy: viewer.userId } as any }
  );

  await logLpmsEvent({
    action: 'UPDATE',
    entityType: 'MAKER_TYPE',
    entityId: id,
    entityLabel: data.name || id,
    viewer
  });

  return { ok: true };
}

export async function archiveMakerType(id: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager')) {
    return { ok: false, error: 'Unauthorized' };
  }

  const collection = await getLpmsMakerTypesCollection();
  await collection.updateOne(
    { _id: new ObjectId(id) as any, companyId },
    { $set: { archived: true, updatedAt: new Date().toISOString(), updatedBy: viewer.userId } as any }
  );

  await logLpmsEvent({
    action: 'ARCHIVE',
    entityType: 'MAKER_TYPE',
    entityId: id,
    viewer
  });

  return { ok: true };
}

export async function generateDocumentNumber(makerTypeId: string, companyId: string): Promise<string> {
  const makersCol = await getLpmsMakerTypesCollection();
  const maker = await makersCol.findOne({ _id: new ObjectId(makerTypeId) as any, companyId });
  
  const prefix = maker && (maker as any).code ? (maker as any).code : 'DOC';
  const year = new Date().getFullYear();
  
  const docsCol = await getLpmsDocumentsCollection();
  const lastDoc = await docsCol.findOne(
    { companyId, makerTypeId: makerTypeId as any },
    { sort: { createdAt: -1 } }
  );
  
  let nextNum = 1;
  if (lastDoc && lastDoc.documentNumber) {
    const parts = lastDoc.documentNumber.split('-');
    if (parts.length === 3 && parts[1] === year.toString()) {
      nextNum = parseInt(parts[2], 10) + 1;
    }
  }
  
  const sequenceStr = nextNum.toString().padStart(3, '0');
  return `${prefix}-${year}-${sequenceStr}`;
}
