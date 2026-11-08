import 'server-only';
import { getLpmsCategoriesCollection } from '@/lib/products/contractflow-ai/db';
import { currentCompanyId } from '@/lib/platform/tenancy/context';
import type { LpmsViewer, LpmsCategory } from '@/lib/products/contractflow-ai/types';
import { logLpmsEvent } from './audit';
import { ObjectId } from 'mongodb';

export async function listCategories(viewer: LpmsViewer): Promise<LpmsCategory[]> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsCategoriesCollection();
  const categories = await collection.find({ companyId, archived: { $ne: true } }).toArray();
  return categories.map(c => ({
    ...c,
    _id: c._id.toString(),
    id: c._id.toString()
  })) as any;
}

export async function getCategory(id: string, viewer: LpmsViewer): Promise<LpmsCategory | null> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsCategoriesCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) as any, companyId });
  if (!doc) return null;
  return { ...doc, _id: doc._id.toString(), id: doc._id.toString() } as any;
}

export async function createCategory(data: any, viewer: LpmsViewer): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager')) {
    return { ok: false, error: 'Unauthorized' };
  }

  const collection = await getLpmsCategoriesCollection();
  const result = await collection.insertOne({
    companyId,
    ...data,
    createdAt: new Date().toISOString(),
    createdBy: viewer.userId,
    archived: false,
  } as any);

  const id = result.insertedId.toString();

  await logLpmsEvent({
    action: 'CREATE',
    entityType: 'CATEGORY',
    entityId: id,
    entityLabel: data.name,
    viewer
  });

  return { ok: true, id };
}

export async function updateCategory(id: string, data: any, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager')) {
    return { ok: false, error: 'Unauthorized' };
  }

  const collection = await getLpmsCategoriesCollection();
  await collection.updateOne(
    { _id: new ObjectId(id) as any, companyId },
    { $set: { ...data, updatedAt: new Date().toISOString(), updatedBy: viewer.userId } }
  );

  await logLpmsEvent({
    action: 'UPDATE',
    entityType: 'CATEGORY',
    entityId: id,
    entityLabel: data.name || id,
    viewer
  });

  return { ok: true };
}

export async function archiveCategory(id: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager')) {
    return { ok: false, error: 'Unauthorized' };
  }

  const collection = await getLpmsCategoriesCollection();
  await collection.updateOne(
    { _id: new ObjectId(id) as any, companyId },
    { $set: { archived: true, updatedAt: new Date().toISOString(), updatedBy: viewer.userId } }
  );

  await logLpmsEvent({
    action: 'ARCHIVE',
    entityType: 'CATEGORY',
    entityId: id,
    viewer
  });

  return { ok: true };
}
