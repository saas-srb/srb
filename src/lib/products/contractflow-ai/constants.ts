import { DocumentStatus } from "./types";

export const LPMS_STATUSES: { value: DocumentStatus; label: string; badgeClass: string; dotClass: string; chartColor: string }[] = [
  { value: "draft", label: "Draft", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50", chartColor: "#94a3b8" },
  { value: "review", label: "In Review", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500", chartColor: "#f59e0b" },
  { value: "pending_approval", label: "Pending Approval", badgeClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400", dotClass: "bg-indigo-500", chartColor: "#6366f1" },
  { value: "approved", label: "Approved", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500", chartColor: "#3b82f6" },
  { value: "published", label: "Published", badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", dotClass: "bg-emerald-500", chartColor: "#10b981" },
  { value: "active", label: "Active", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", chartColor: "#22c55e" },
  { value: "archived", label: "Archived", badgeClass: "bg-gray-500/15 text-gray-600 dark:text-gray-400", dotClass: "bg-gray-500", chartColor: "#6b7280" },
];

export const TEMPLATE_BLOCK_TYPES = [
  { value: 'paragraph', label: 'Paragraph', hint: 'Basic text paragraph', icon: 'Type' },
  { value: 'heading', label: 'Heading', hint: 'Section heading', icon: 'Heading' },
  { value: 'bullets', label: 'Bullet List', hint: 'Unordered list', icon: 'List' },
  { value: 'numbered', label: 'Numbered List', hint: 'Ordered list', icon: 'ListOrdered' },
  { value: 'table', label: 'Table', hint: 'Data table', icon: 'Table' },
  { value: 'image', label: 'Image', hint: 'Picture or diagram', icon: 'Image' },
  { value: 'logo', label: 'Company Logo', hint: 'Dynamic company logo', icon: 'Image' },
  { value: 'signature', label: 'Signature Line', hint: 'Signer input field', icon: 'PenTool' },
  { value: 'variable', label: 'Variable', hint: 'Dynamic field data', icon: 'Braces' },
  { value: 'conditional', label: 'Conditional Block', hint: 'Show/hide content', icon: 'Split' },
  { value: 'repeating', label: 'Repeating Block', hint: 'Loop over lists', icon: 'Repeat' },
  { value: 'divider', label: 'Divider', hint: 'Horizontal line', icon: 'Minus' },
  { value: 'spacer', label: 'Spacer', hint: 'Empty space', icon: 'Space' },
  { value: 'pagebreak', label: 'Page Break', hint: 'Force new page', icon: 'FileDown' },
  { value: 'note', label: 'Note Box', hint: 'Highlighted callout', icon: 'MessageSquare' },
  { value: 'attachment', label: 'Attachment', hint: 'Attached file link', icon: 'Paperclip' },
];

export const OUTPUT_FORMATS = [
  { value: 'pdf', label: 'PDF Document', icon: 'FileText' },
  { value: 'docx', label: 'Word Document', icon: 'File' },
  { value: 'print', label: 'Print Only', icon: 'Printer' },
];

export const LPMS_ACTIONS_LABEL: Record<string, string> = {
  create: 'Created document',
  update: 'Updated document',
  submit_review: 'Submitted for review',
  approve: 'Approved document',
  reject: 'Rejected document',
  publish: 'Published document',
  archive: 'Archived document',
  sign: 'Signed document',
  generate: 'Generated content',
};

export const DEFAULT_WORKFLOW_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export function formatDocumentNumber(prefix: string, seq: number, padLength: number = 4): string {
  return `${prefix}-${String(seq).padStart(padLength, '0')}`;
}

export const fileUrl = (id: string) => `/api/contractflow-ai/files/${id}`;
