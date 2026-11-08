import 'server-only';
import { getLpmsDocumentsCollection } from '@/lib/products/contractflow-ai/db';
import { currentCompanyId } from '@/lib/platform/tenancy/context';
import type { LpmsViewer, DocumentDoc } from '@/lib/products/contractflow-ai/types';
import { ObjectId } from 'mongodb';

export async function searchDocuments(
  opts: { q?: string; makerTypeId?: string; status?: string; category?: string; department?: string; owner?: string; tags?: string[]; effectiveDateFrom?: string; expiryDateTo?: string; page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc' },
  viewer: LpmsViewer
): Promise<{ items: DocumentDoc[]; total: number; totalPages: number }> {
  const companyId = currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsDocumentsCollection();
  const filter: any = { companyId };
  
  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager')) {
    if (viewer.roles.includes('lpms_author')) {
      filter.$or = [
        { status: { $in: ['published', 'active'] } },
        { ownerId: viewer.userId }
      ];
    } else {
      filter.status = { $in: ['published', 'active'] };
    }
  }

  if (opts.q) filter.$text = { $search: opts.q };
  if (opts.makerTypeId) filter.makerTypeId = new ObjectId(opts.makerTypeId);
  if (opts.status) filter.status = opts.status;
  if (opts.category) filter.categoryId = new ObjectId(opts.category);
  if (opts.owner) filter.ownerId = opts.owner;

  const page = opts.page || 1;
  const pageSize = opts.pageSize || 20;
  const skip = (page - 1) * pageSize;
  
  const sortDir = opts.sortDir === 'asc' ? 1 : -1;
  const sortQuery: any = opts.sortBy ? { [opts.sortBy]: sortDir } : { createdAt: -1 };
  if (opts.q) sortQuery.score = { $meta: 'textScore' };

  const cursor = collection.find(filter);
  if (opts.q) cursor.project({ score: { $meta: 'textScore' } });
  
  const items = await cursor.sort(sortQuery).skip(skip).limit(pageSize).toArray();
  const total = await collection.countDocuments(filter);

  return {
    items: items.map(c => ({ ...c, _id: c._id.toString(), id: c._id.toString() })) as any,
    total,
    totalPages: Math.ceil(total / pageSize)
  };
}
