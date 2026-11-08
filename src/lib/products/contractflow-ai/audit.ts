import 'server-only';
import { getLpmsAuditCollection } from '@/lib/products/contractflow-ai/db';
import { currentCompanyId } from '@/lib/platform/tenancy/context';
import type { LpmsViewer } from '@/lib/products/contractflow-ai/types';

export interface AuditEvent {
  _id?: string;
  companyId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  actorId: string;
  actorEmail: string;
  data?: any;
  createdAt: string;
}

export async function logLpmsEvent(event: {
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  data?: any;
  viewer: LpmsViewer;
}): Promise<void> {
  const companyId = await currentCompanyId();
  if (!companyId) return;

  const collection = await getLpmsAuditCollection();
  
  await collection.insertOne({
    companyId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    entityLabel: event.entityLabel,
    actorId: event.viewer.userId,
    actorEmail: event.viewer.email,
    data: event.data,
    createdAt: new Date().toISOString(),
  } as any);
}

export async function listAuditEvents(
  opts: { action?: string; entityType?: string; entityId?: string; actorId?: string; from?: string; to?: string; page?: number; pageSize?: number },
  viewer: LpmsViewer
): Promise<{ items: AuditEvent[]; total: number }> {
  // Requires VIEW_AUDIT
  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager')) {
     throw new Error('Unauthorized');
  }

  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsAuditCollection();
  const filter: any = { companyId };
  
  if (opts.action) filter.action = opts.action;
  if (opts.entityType) filter.entityType = opts.entityType;
  if (opts.entityId) filter.entityId = opts.entityId;
  if (opts.actorId) filter.actorId = opts.actorId;
  
  if (opts.from || opts.to) {
    filter.createdAt = {};
    if (opts.from) filter.createdAt.$gte = opts.from;
    if (opts.to) filter.createdAt.$lte = opts.to;
  }

  const page = opts.page || 1;
  const pageSize = opts.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const items = await collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray();
  const total = await collection.countDocuments(filter);

  return { items: items as any, total };
}
