import 'server-only';
import { getLpmsTemplatesCollection } from '@/lib/products/contractflow-ai/db';
import { currentCompanyId } from '@/lib/platform/tenancy/context';
import type { LpmsViewer, TemplateDoc } from '@/lib/products/contractflow-ai/types';
import { logLpmsEvent } from './audit';
import { ObjectId } from 'mongodb';

export async function listTemplates(
  opts: { makerTypeId?: string; search?: string },
  viewer: LpmsViewer
): Promise<TemplateDoc[]> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsTemplatesCollection();
  const filter: any = { companyId, archived: { $ne: true } };
  
  if (opts.makerTypeId) {
    filter.makerTypeId = opts.makerTypeId;
  }
  
  if (opts.search) {
    filter.title = { $regex: opts.search, $options: 'i' };
  }

  const items = await collection.find(filter).sort({ title: 1 }).toArray();
  return items.map(c => ({
    ...c,
    _id: c._id.toString(),
    id: c._id.toString()
  })) as any;
}

export async function getTemplate(id: string, viewer: LpmsViewer): Promise<TemplateDoc | null> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsTemplatesCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) as any, companyId });
  if (!doc) return null;
  return { ...doc, _id: doc._id.toString(), id: doc._id.toString() } as any;
}

export async function createTemplate(data: any, viewer: LpmsViewer): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager') && !viewer.roles.includes('lpms_author')) {
    return { ok: false, error: 'Unauthorized (requires MANAGE_TEMPLATES)' };
  }

  const collection = await getLpmsTemplatesCollection();
  const result = await collection.insertOne({
    companyId,
    ...data,
    makerTypeId: data.makerTypeId || undefined,
    version: 1,
    archived: false,
    createdAt: new Date().toISOString(),
    createdBy: viewer.userId,
  } as any);

  const id = result.insertedId.toString();

  await logLpmsEvent({
    action: 'CREATE',
    entityType: 'TEMPLATE',
    entityId: id,
    entityLabel: data.title,
    viewer
  });

  return { ok: true, id };
}

export async function updateTemplate(id: string, data: any, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager') && !viewer.roles.includes('lpms_author')) {
    return { ok: false, error: 'Unauthorized' };
  }

  const collection = await getLpmsTemplatesCollection();
  
  await collection.updateOne(
    { _id: new ObjectId(id) as any, companyId },
    { 
      $set: { ...data, updatedAt: new Date().toISOString(), updatedBy: viewer.userId } as any,
      $inc: { version: 1 } 
    }
  );

  await logLpmsEvent({
    action: 'UPDATE',
    entityType: 'TEMPLATE',
    entityId: id,
    entityLabel: data.title || id,
    viewer
  });

  return { ok: true };
}

export async function archiveTemplate(id: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager') && !viewer.roles.includes('lpms_author')) {
    return { ok: false, error: 'Unauthorized' };
  }

  const collection = await getLpmsTemplatesCollection();
  await collection.updateOne(
    { _id: new ObjectId(id) as any, companyId },
    { $set: { archived: true, updatedAt: new Date().toISOString(), updatedBy: viewer.userId } as any }
  );

  await logLpmsEvent({
    action: 'ARCHIVE',
    entityType: 'TEMPLATE',
    entityId: id,
    viewer
  });

  return { ok: true };
}

export async function cloneTemplate(id: string, newName: string, viewer: LpmsViewer): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const template = await getTemplate(id, viewer);
  if (!template) return { ok: false, error: 'Template not found' };

  const { _id, id: _, createdAt, createdBy, updatedAt, updatedBy, version, ...rest } = template as any;
  return createTemplate({ ...rest, title: newName }, viewer);
}
