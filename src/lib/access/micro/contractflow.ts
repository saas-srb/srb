import type { MicroFeature } from "./types";

const P = "contractflow-ai";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all"];

/** What everybody given ContractFlow gets: the dashboard (which shows only what their other features allow). */
const BASELINE = new Set(["dashboard.view"]);

const ROWS: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the ContractFlow dashboard, KPIs and the SOP list.", "read", ["lpms.VIEW"]],
  ["documents.view", "Documents", "page", "See documents", "Open the document list and a document's details.", "read", ["lpms.VIEW"]],
  ["documents.create", "Documents", "button", "Create documents", "Start a new document from a maker or a template.", "write", ["lpms.CREATE"]],
  ["documents.edit", "Documents", "button", "Edit documents", "Edit a draft or review document and submit it for approval.", "write", ["lpms.EDIT"]],
  ["documents.approve", "Documents", "button", "Approve and reject", "Open the approvals queue and approve or reject documents.", "write", ["lpms.APPROVE"]],
  ["documents.publish", "Documents", "button", "Publish documents", "Publish an approved document.", "write", ["lpms.PUBLISH"]],
  ["documents.archive", "Documents", "button", "Archive documents", "Archive an active or published document.", "write", ["lpms.ARCHIVE"]],
  ["documents.delete", "Documents", "button", "Delete documents", "Delete a draft document.", "write", ["lpms.DELETE"]],
  ["documents.download", "Documents", "export", "Download documents", "Download a document or its signed copy.", "read", ["lpms.DOWNLOAD"]],
  ["archive.view", "Archive", "page", "See the archive", "Open archived documents.", "read", ["lpms.VIEW"]],
  ["signatures.view", "Signatures", "page", "See signature documents", "Open the signature list, a signature document and its history.", "read", ["lpms.VIEW"]],
  ["signatures.sign", "Signatures", "button", "Send for signature", "Send documents to signers, resend, void and seal them.", "write", ["lpms.SIGN"]],
  ["signatures.manage", "Signatures", "button", "Manage signature documents", "Manage any signature document: send, void, record and pick parties.", "write", ["lpms.MANAGE_DOCUMENTS"]],
  ["parties.all", "Signatures", "scope", "See every kind of party", "Without this a person picks parties only from the kinds their own other products allow (clients, vendors, employees ...). With it they can pick any kind of party.", "read", ["lpms.isLpmsAdmin", "lpms.isLpmsManagerTier"], "all"],
  ["templates.manage", "Templates", "page", "Manage templates", "Open, create, edit and delete document templates.", "write", ["lpms.MANAGE_TEMPLATES"]],
  ["makers.manage", "Document makers", "page", "Manage document makers", "Open, create, edit and archive document maker types.", "write", ["lpms.MANAGE_MAKERS"]],
  ["policies.manage", "Policies & settings", "page", "Manage policies and settings", "Manage categories, workflows, signing policies and settings.", "write", ["lpms.MANAGE_POLICIES"]],
  ["audit.view", "Activity log", "page", "Read the activity log", "Read the ContractFlow activity log.", "read", ["lpms.VIEW_AUDIT"]],
];

export const CONTRACTFLOW_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
