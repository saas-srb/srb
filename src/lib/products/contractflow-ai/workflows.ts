import 'server-only';
import { getLpmsWorkflowsCollection, getLpmsApprovalsCollection } from '@/lib/products/contractflow-ai/db';
import { currentCompanyId } from '@/lib/platform/tenancy/context';
import type { LpmsViewer, WorkflowDef, ApprovalRecord } from '@/lib/products/contractflow-ai/types';
import { logLpmsEvent } from './audit';
import { ObjectId } from 'mongodb';

export async function listWorkflows(viewer: LpmsViewer): Promise<WorkflowDef[]> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsWorkflowsCollection();
  const items = await collection.find({ companyId }).toArray();
  return items.map(c => ({
    ...c,
    _id: c._id.toString(),
    id: c._id.toString()
  })) as any;
}

export async function getWorkflow(id: string, viewer: LpmsViewer): Promise<WorkflowDef | null> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsWorkflowsCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) as any, companyId });
  if (!doc) return null;
  
  return { ...doc, _id: doc._id.toString(), id: doc._id.toString() } as any;
}

export async function createWorkflow(data: any, viewer: LpmsViewer): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager')) {
    return { ok: false, error: 'Unauthorized (requires MANAGE_MAKERS)' };
  }

  const collection = await getLpmsWorkflowsCollection();
  const result = await collection.insertOne({
    companyId,
    ...data,
    createdAt: new Date().toISOString(),
    createdBy: viewer.userId,
  } as any);

  const id = result.insertedId.toString();

  await logLpmsEvent({
    action: 'CREATE',
    entityType: 'WORKFLOW',
    entityId: id,
    entityLabel: data.name,
    viewer
  });

  return { ok: true, id };
}

export async function updateWorkflow(id: string, data: any, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager')) {
    return { ok: false, error: 'Unauthorized' };
  }

  const collection = await getLpmsWorkflowsCollection();
  await collection.updateOne(
    { _id: new ObjectId(id) as any, companyId },
    { $set: { ...data, updatedAt: new Date().toISOString(), updatedBy: viewer.userId } as any }
  );

  await logLpmsEvent({
    action: 'UPDATE',
    entityType: 'WORKFLOW',
    entityId: id,
    entityLabel: data.name || id,
    viewer
  });

  return { ok: true };
}

export async function deleteWorkflow(id: string, viewer: LpmsViewer): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  if (!viewer.roles.includes('lpms_admin') && !viewer.roles.includes('lpms_manager')) {
    return { ok: false, error: 'Unauthorized' };
  }

  const collection = await getLpmsWorkflowsCollection();
  await collection.deleteOne({ _id: new ObjectId(id) as any, companyId });

  await logLpmsEvent({
    action: 'DELETE',
    entityType: 'WORKFLOW',
    entityId: id,
    viewer
  });

  return { ok: true };
}

export async function getPendingApprovals(viewer: LpmsViewer): Promise<ApprovalRecord[]> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsApprovalsCollection();
  const approvals = await collection.find({
    companyId,
    status: 'pending',
    $or: [
      { assigneeId: viewer.userId },
      { role: { $in: viewer.roles } }
    ]
  }).toArray();
  
  return approvals.map(c => ({
    ...c,
    _id: c._id.toString(),
    id: c._id.toString()
  })) as any;
}

export async function getDocumentApprovals(documentId: string, viewer: LpmsViewer): Promise<ApprovalRecord[]> {
  const companyId = await currentCompanyId();
  if (!companyId) throw new Error('No company context');

  const collection = await getLpmsApprovalsCollection();
  const approvals = await collection.find({ companyId, documentId }).toArray();
  
  return approvals.map(c => ({
    ...c,
    _id: c._id.toString(),
    id: c._id.toString()
  })) as any;
}
