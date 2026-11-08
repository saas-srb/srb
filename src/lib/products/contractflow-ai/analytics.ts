import 'server-only';
import { getLpmsDocumentsCollection, getLpmsApprovalsCollection, getLpmsMakerTypesCollection, getLpmsCategoriesCollection } from '@/lib/products/contractflow-ai/db';
import { currentCompanyId } from '@/lib/platform/tenancy/context';
import type { LpmsViewer } from '@/lib/products/contractflow-ai/types';

export interface ChartDatum {
  key: string;
  label: string;
  value: number;
  href?: string;
  color?: string;
}

export interface LpmsDashboardData {
  kpis: {
    totalDocuments: number;
    activeDocuments: number;
    draftDocuments: number;
    pendingApprovals: number;
    expiringDocuments: number;
    aiGenerated: number;
  };
  byStatus: ChartDatum[];
  byMakerType: ChartDatum[];
  byCategory: ChartDatum[];
  pendingApprovalsList: any[];
  recentDocuments: any[];
  expiringDocuments: any[];
  creationTrend: { label: string; value: number }[];
}

export interface LpmsDashboardFilters {
  q?: string;
  from?: string;
  to?: string;
}

export async function getLpmsDashboard(_viewer: LpmsViewer, filters: LpmsDashboardFilters = {}): Promise<LpmsDashboardData> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  // Search & date filters apply to the document counts and charts.
  const created: { $gte?: Date; $lte?: Date } = {};
  if (filters.from && !Number.isNaN(Date.parse(filters.from))) created.$gte = new Date(`${filters.from}T00:00:00`);
  if (filters.to && !Number.isNaN(Date.parse(filters.to))) created.$lte = new Date(`${filters.to}T23:59:59.999`);
  const q = filters.q?.trim().slice(0, 80);
  const docScope: Record<string, unknown> = {
    companyId,
    ...(created.$gte || created.$lte ? { createdAt: created } : {}),
    ...(q ? { title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } } : {}),
  };

  const docsCol = await getLpmsDocumentsCollection();
  const approvalsCol = await getLpmsApprovalsCollection();
  const makersCol = await getLpmsMakerTypesCollection();
  const categoriesCol = await getLpmsCategoriesCollection();

  const totalDocuments = await docsCol.countDocuments({ ...docScope });
  const activeDocuments = await docsCol.countDocuments({ ...docScope, status: 'active' });
  const draftDocuments = await docsCol.countDocuments({ ...docScope, status: 'draft' });
  const aiGenerated = await docsCol.countDocuments({ ...docScope, isAiGenerated: true });
  
  const pendingApprovalsList = await approvalsCol.find({ companyId, status: 'pending' }).limit(5).toArray();
  const pendingApprovals = await approvalsCol.countDocuments({ companyId, status: 'pending' });

  const recentDocuments = await docsCol.find({ ...docScope }).sort({ createdAt: -1 }).limit(5).toArray();

  const statusAgg = await docsCol.aggregate([
    { $match: docScope },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray();

  const byStatus: ChartDatum[] = statusAgg.map(s => ({
    key: String(s._id || 'unknown'),
    label: String(s._id || 'Unknown'),
    value: s.count,
    href: `/contractflow-ai/documents?status=${s._id}`
  }));

  const makerTypes = await makersCol.find({ companyId }).toArray();
  const makerMap = Object.fromEntries(makerTypes.map(m => [m._id.toString(), m.name]));

  const makerAgg = await docsCol.aggregate([
    { $match: docScope },
    { $group: { _id: '$makerTypeId', count: { $sum: 1 } } }
  ]).toArray();

  const byMakerType: ChartDatum[] = makerAgg.map(m => {
    const key = m._id ? m._id.toString() : 'unknown';
    return {
      key,
      label: key !== 'unknown' ? (makerMap[key] || 'Unknown') : 'Unknown',
      value: m.count,
      href: `/contractflow-ai/documents?makerTypeId=${key}`
    };
  });

  const categories = await categoriesCol.find({ companyId }).toArray();
  const catMap = Object.fromEntries(categories.map(c => [c._id.toString(), c.name]));

  const catAgg = await docsCol.aggregate([
    { $match: docScope },
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]).toArray();

  const byCategory: ChartDatum[] = catAgg.map(c => {
    const key = c._id ? c._id.toString() : 'unknown';
    return {
      key,
      label: key !== 'unknown' ? (catMap[key] || key) : 'Uncategorized',
      value: c.count
    };
  });

  return {
    kpis: { totalDocuments, activeDocuments, draftDocuments, pendingApprovals, expiringDocuments: 0, aiGenerated },
    byStatus,
    byMakerType,
    byCategory,
    pendingApprovalsList,
    recentDocuments: recentDocuments.map(d => ({ ...d, _id: d._id.toString(), id: d._id.toString() })),
    expiringDocuments: [],
    creationTrend: []
  };
}
