export type DocumentStatus = 'draft' | 'review' | 'pending_approval' | 'approved' | 'published' | 'active' | 'archived';

export type OutputFormat = 'pdf' | 'docx' | 'print';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'entity';
  options?: string[];
  entitySource?: string;
  required: boolean;
  defaultValue?: any;
}

export interface BrandingConfig {
  useLogo: boolean;
  useColors: boolean;
  useHeader: boolean;
  useFooter: boolean;
  headerText?: string;
  footerText?: string;
}

export interface MakerPermissions {
  create: string[];
  edit: string[];
  approve: string[];
  publish: string[];
  archive: string[];
}

export interface NumberingConfig {
  prefix: string;
  separator: string;
  startFrom: number;
  paddingLength: number;
  includeYear: boolean;
  includeMonth: boolean;
}

export interface MakerTypeDoc {
  _id: string;
  companyId: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  fieldsSchema: FieldDef[];
  defaultDataSources: string[];
  workflowId: string | null;
  outputFormats: OutputFormat[];
  brandingConfig: BrandingConfig;
  permissions: MakerPermissions;
  numbering: NumberingConfig;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type TemplateBlock =
  | { id: string; type: 'paragraph'; content: string }
  | { id: string; type: 'heading'; content: string; level: 1 | 2 | 3 | 4 }
  | { id: string; type: 'bullets'; items: string[] }
  | { id: string; type: 'numbered'; items: string[] }
  | { id: string; type: 'table'; header: string[]; rows: string[][]; caption?: string }
  | { id: string; type: 'image'; fileId: string | null; url: string | null; alt: string; caption: string; width?: number }
  | { id: string; type: 'logo'; position: 'left' | 'center' | 'right'; width?: number }
  | { id: string; type: 'signature'; label: string; signerRole: string; required: boolean }
  | { id: string; type: 'variable'; key: string; label: string; fallback: string }
  | { id: string; type: 'conditional'; condition: string; operator: 'eq' | 'neq' | 'exists' | 'not_exists'; value: string; blocks: TemplateBlock[] }
  | { id: string; type: 'repeating'; source: string; itemVar: string; blocks: TemplateBlock[] }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; height: number }
  | { id: string; type: 'pagebreak' }
  | { id: string; type: 'note'; content: string; variant: 'info' | 'warning' | 'important' }
  | { id: string; type: 'attachment'; fileId: string; label: string };

export interface TemplateDoc {
  _id: string;
  companyId: string;
  makerTypeId: string;
  name: string;
  description: string;
  isDefault: boolean;
  blocks: TemplateBlock[];
  headerBlocks: TemplateBlock[];
  footerBlocks: TemplateBlock[];
  variables: string[];
  tags: string[];
  version: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface DocumentDoc {
  _id: string;
  companyId: string;
  makerTypeId: string;
  templateId: string;
  documentNumber: string;
  title: string;
  status: DocumentStatus;
  blocks: TemplateBlock[];
  headerBlocks: TemplateBlock[];
  footerBlocks: TemplateBlock[];
  resolvedVariables: Record<string, string>;
  selectedEntities: Record<string, string[]>;
  fieldValues: Record<string, unknown>;
  currentVersion: number;
  workflowId: string | null;
  currentWorkflowStep: string | null;
  signatures: SignatureRecord[];
  tags: string[];
  category: string;
  department: string;
  owner: string;
  collaborators: string[];
  effectiveDate: Date | null;
  expiryDate: Date | null;
  isAiGenerated: boolean;
  aiPrompt: string | null;
  outputFormat: OutputFormat | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  publishedAt: Date | null;
  publishedBy: string | null;
  approvedAt: Date | null;
  approvedBy: string | null;
}

export interface DocumentVersionDoc {
  _id: string;
  companyId: string;
  documentId: string;
  versionNumber: number;
  blocks: TemplateBlock[];
  headerBlocks: TemplateBlock[];
  footerBlocks: TemplateBlock[];
  resolvedVariables: Record<string, string>;
  fieldValues?: Record<string, unknown>;
  selectedEntities?: Record<string, string[]>;
  status: DocumentStatus;
  changeNote: string | null;
  createdAt: Date;
  createdBy: string;
}

export interface WorkflowCondition {
  field: string;
  operator: string;
  value: string;
}

export interface WorkflowStep {
  id: string;
  order: number;
  label: string;
  requiredRoles: string[];
  conditions: WorkflowCondition[];
  notifyRoles: string[];
  escalateAfterDays: number | null;
}

export interface WorkflowDef {
  _id: string;
  companyId: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalRecord {
  _id: string;
  companyId: string;
  documentId: string;
  workflowStepId: string;
  stepLabel: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  requestedBy: string;
  assignedTo: string[];
  decidedBy: string | null;
  decision: string | null;
  notes: string | null;
  requestedAt: Date;
  decidedAt: Date | null;
}

export interface SignatureRecord {
  id: string;
  documentId: string;
  signerName: string;
  signerEmail: string;
  signerRole: string;
  status: 'pending' | 'signed' | 'declined' | 'expired';
  requestedAt: Date;
  signedAt: Date | null;
  signatureData: string | null;
  providerId: string | null;
  providerRef: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SignatureRequest {
  _id: string;
  companyId: string;
  documentId: string;
  signers: SignatureRecord[];
  status: 'pending' | 'completed' | 'expired' | 'cancelled';
  providerName: string | null;
  providerDocId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  createdBy: string;
}

export interface LpmsCategory {
  _id: string;
  companyId: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  description: string;
  parentId: string | null;
  makerTypeIds: string[];
  isArchived: boolean;
  order: number;
  createdAt: Date;
}

export interface VariableEntry {
  key: string;
  label: string;
  source: 'workspace' | 'hrms' | 'pms' | 'prms' | 'tms' | 'fms' | 'lms' | 'dlms';
  entity: string;
  field: string;
  dataType: string;
  sampleValue: string;
  requiresEntitySelection: boolean;
}

export interface LpmsViewer {
  userId: string;
  email: string;
  roles: string[];
  overrides: Record<string, boolean>;
  lpmsRoles: string[];
  employeeId: string | null;
  companyId: string;
}
