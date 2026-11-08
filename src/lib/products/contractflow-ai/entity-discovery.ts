import 'server-only';
import type { LpmsViewer } from '@/lib/products/contractflow-ai/types';
import { currentCompanyId } from '@/lib/platform/tenancy/context';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { canViewAllEmployees } from '@/lib/hrms-roles';
import { getCompany } from '@/lib/platform/tenancy/companies';
import { getCurrentHubUser } from '@/lib/hub-auth';

export interface EntityDefinition {
  key: string;
  label: string;
  fields: FieldDefinition[];
}

export interface FieldDefinition {
  key: string;
  label: string;
  variableKey: string;
  dataType: 'text' | 'date' | 'number' | 'email' | 'phone' | 'url';
  sampleValue?: string;
}

export interface EntityRecord {
  id: string;
  label: string;
  subtitle?: string;
}

export interface PanelEntityAdapter {
  panelKey: string;
  panelLabel: string;
  canAccess: (viewer: LpmsViewer) => boolean;
  getEntities: () => EntityDefinition[];
  fetchRecords: (entityKey: string, opts: { search?: string; limit?: number; companyId: string }) => Promise<EntityRecord[]>;
  resolveField: (entityKey: string, recordId: string, fieldKey: string, companyId: string) => Promise<string | null>;
}

// Workspace adapter: the company and the signed-in person
const workspaceAdapter: PanelEntityAdapter = {
  panelKey: 'workspace',
  panelLabel: 'Workspace',
  canAccess: () => true,
  getEntities: () => [
    {
      key: 'workspace.company',
      label: 'Company',
      fields: [
        { key: 'name', label: 'Company Name', variableKey: 'workspace.company.name', dataType: 'text' },
        { key: 'legalName', label: 'Legal Name', variableKey: 'workspace.company.legalName', dataType: 'text' },
      ]
    },
    {
      key: 'workspace.user',
      label: 'Current User',
      fields: [
        { key: 'email', label: 'Email', variableKey: 'workspace.user.email', dataType: 'email' },
        { key: 'name', label: 'Name', variableKey: 'workspace.user.name', dataType: 'text' },
      ]
    }
  ],
  fetchRecords: async () => [],
  resolveField: async (entityKey, _recordId, fieldKey, companyId) => {
    if (entityKey === 'workspace.company') {
      const company = await getCompany(companyId);
      if (fieldKey === 'name') return company?.name ?? null;
      if (fieldKey === 'legalName') return ((company as unknown as { legalName?: string } | null)?.legalName) || company?.name || null;
    }
    if (entityKey === 'workspace.user') {
      const user = await getCurrentHubUser();
      if (!user) return null;
      if (fieldKey === 'email') return user.email;
      if (fieldKey === 'name') {
        const doc = await (await getDb()).collection('admin_users').findOne({ _id: new ObjectId(user.id) }, { projection: { name: 1 } });
        return (doc as { name?: string } | null)?.name ?? null;
      }
    }
    return null;
  }
};

// HRMS adapter
const hrmsAdapter: PanelEntityAdapter = {
  panelKey: 'hrms',
  panelLabel: 'Human Resources',
  // Employee records (names, e-mails, pay, IDs) are HR data: only people who may see every employee can pull them into a document.
  canAccess: (viewer) => canViewAllEmployees({ roles: viewer.roles, permissionOverrides: viewer.overrides }),
  getEntities: () => [
    {
      key: 'hrms.employee',
      label: 'Employee',
      fields: [
        { key: 'fullName', label: 'Full Name', variableKey: 'hrms.employee.fullName', dataType: 'text' },
        { key: 'email', label: 'Email', variableKey: 'hrms.employee.email', dataType: 'email' },
      ]
    }
  ],
  fetchRecords: async (entityKey, opts) => {
    if (entityKey === 'hrms.employee') {
      const db = await getDb();
      const col = db.collection('hrms_employees');
      const filter: any = { companyId: opts.companyId };
      if (opts.search) filter.fullName = { $regex: opts.search, $options: 'i' };
      const items = await col.find(filter).limit(opts.limit || 10).toArray();
      return items.map((i: any) => ({ id: i._id.toString(), label: i.fullName || i.email, subtitle: i.email }));
    }
    return [];
  },
  resolveField: async (entityKey, recordId, fieldKey, companyId) => {
    if (entityKey === 'hrms.employee') {
      const db = await getDb();
      const col = db.collection('hrms_employees');
      let objId: any = recordId;
      try { objId = new ObjectId(recordId); } catch {}
      const doc = await col.findOne({ _id: objId, companyId });
      return doc ? doc[fieldKey]?.toString() || null : null;
    }
    return null;
  }
};

const adapters = [workspaceAdapter, hrmsAdapter];

export async function getEnabledModules(companyId: string): Promise<Set<string>> {
  const db = await getDb();
  const col = db.collection('platform_companies');
  let objId: any = companyId;
  try { objId = new ObjectId(companyId); } catch {}
  const comp = await col.findOne({ _id: objId });
  const modules = comp?.enabledModules || ['workspace', 'hrms', 'lpms'];
  return new Set(modules);
}

export async function discoverEntities(viewer: LpmsViewer): Promise<EntityDefinition[]> {
  const companyId = await currentCompanyId();
  if (!companyId) return [];

  const enabled = await getEnabledModules(companyId);
  const entities: EntityDefinition[] = [];

  for (const adapter of adapters) {
    if (enabled.has(adapter.panelKey) && adapter.canAccess(viewer)) {
      entities.push(...adapter.getEntities());
    }
  }
  return entities;
}

export async function fetchEntityRecords(entityKey: string, opts: { search?: string; limit?: number }, viewer: LpmsViewer): Promise<EntityRecord[]> {
  const companyId = await currentCompanyId();
  if (!companyId) return [];

  const adapter = adapters.find(a => a.getEntities().some(e => e.key === entityKey));
  if (!adapter) return [];

  return adapter.fetchRecords(entityKey, { ...opts, companyId });
}

export async function resolveEntityField(entityKey: string, recordId: string, fieldKey: string, viewer: LpmsViewer): Promise<string | null> {
  const companyId = await currentCompanyId();
  if (!companyId) return null;

  const adapter = adapters.find(a => a.getEntities().some(e => e.key === entityKey));
  if (!adapter) return null;

  return adapter.resolveField(entityKey, recordId, fieldKey, companyId);
}
