import type { MicroFeature } from "./types";

const P = "playbook-ai";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all" | "team"];

/** What everybody given Playbook gets: the dashboard. */
const BASELINE = new Set(["dashboard.view"]);
const ANY = ["sop.hasSopAccess"];

/**
 * Playbook in micro features: its documents (templates, AI drafting, approval, export, handoff to ContractFlow, brand, variables, retention, audit) and its SOP library
 * (publish, assign, acknowledge, archive, download). Which SOPs a person reaches (everyone's, their department's, their own) is the object scope in `access.ts`,
 * shown here as the scope features `sops.all` and `sops.team`.
 */
const ROWS: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the Playbook dashboard.", "read", ANY],
  // Documents
  ["documents.view", "Documents", "page", "Open documents", "Open the documents their type, confidentiality and scope allow.", "read", ["playbook.VIEW"]],
  ["documents.create", "Documents", "action", "Create documents", "Start a document from a template, with or without AI.", "write", ["playbook.CREATE"]],
  ["documents.edit", "Documents", "action", "Edit documents", "Edit drafts within their scope.", "write", ["playbook.EDIT"]],
  ["documents.comment", "Documents", "action", "Comment on documents", "Comment on documents the person can open.", "write", ["playbook.COMMENT"]],
  ["documents.submit", "Documents", "action", "Submit for review", "Submit a draft for approval.", "write", ["playbook.SUBMIT"]],
  ["documents.approve", "Documents", "button", "Approve documents", "Approve or reject documents sent for review.", "write", ["playbook.APPROVE"]],
  ["documents.issue", "Documents", "button", "Issue documents", "Issue an approved document: assigns its number and freezes the version.", "write", ["playbook.ISSUE"]],
  ["documents.export", "Documents", "export", "Download as PDF or Word", "Download a document as PDF or DOCX.", "read", ["playbook.EXPORT"]],
  ["documents.share", "Documents", "button", "Share documents", "Share a document internally or by a read-only link.", "write", ["playbook.SHARE"]],
  ["documents.sendsignature", "Documents", "button", "Send for signature", "Create a clone in ContractFlow so it can be signed.", "write", ["playbook.SEND_FOR_SIGNATURE"]],
  ["documents.useai", "Documents", "action", "Use AI drafting", "Generate, rewrite and improve sections with AI.", "write", ["playbook.USE_AI"]],
  ["templates.manage", "Templates", "button", "Manage templates", "Clone, edit and create the company's own templates.", "write", ["playbook.MANAGE_TEMPLATES"]],
  ["templates.review", "Templates", "button", "Review templates", "Set a template's reviewed-by and reviewed-on stamp (legal review).", "write", ["playbook.REVIEW_TEMPLATES"]],
  ["brand.manage", "Brand", "button", "Manage brand and letterhead", "Change logo, colours, fonts, header, footer and page margins.", "write", ["playbook.MANAGE_BRAND"]],
  ["variables.manage", "Variables", "button", "Manage variables", "Define the company's own document variables.", "write", ["playbook.MANAGE_VARIABLES"]],
  ["retention.manage", "Retention", "button", "Retention, purge and legal hold", "Set retention periods, place or lift a legal hold, and purge documents.", "write", ["playbook.MANAGE_RETENTION"]],
  ["documentaudit.view", "Documents", "page", "Read the document audit", "Read the document audit trail.", "read", ["playbook.VIEW_AUDIT"]],
  ["documentsettings.manage", "Documents", "button", "Manage document settings", "Numbering, approval rules, AI and other document settings.", "write", ["playbook.SETTINGS"]],
  // SOPs
  ["sops.view", "SOPs", "page", "Open SOPs", "Open the SOPs the person's department, ownership or assignments allow.", "read", ["sop.VIEW"]],
  ["sops.create", "SOPs", "action", "Create SOPs", "Write new SOPs and KPIs.", "write", ["sop.CREATE"]],
  ["sops.feedback", "SOPs", "action", "Send feedback on SOPs", "Send feedback or a change request on a SOP the person can open.", "write", ["sop.VIEW"]],
  ["sops.edit", "SOPs", "action", "Edit SOPs", "Edit SOPs within the person's scope.", "write", ["sop.EDIT"]],
  ["sops.publish", "SOPs", "button", "Publish SOPs", "Publish a SOP so people can read it.", "write", ["sop.PUBLISH"]],
  ["sops.assign", "SOPs", "button", "Assign SOPs", "Assign a SOP to people or departments.", "write", ["sop.ASSIGN"]],
  ["sops.acknowledge", "SOPs", "action", "Acknowledge SOPs", "Confirm that the person has read an assigned SOP.", "write", ["sop.ACKNOWLEDGE"]],
  ["sops.archive", "SOPs", "button", "Archive SOPs", "Archive and restore SOPs.", "write", ["sop.ARCHIVE"]],
  ["sops.download", "SOPs", "export", "Download SOPs", "Download a SOP's files.", "read", ["sop.DOWNLOAD"]],
  ["sops.export", "SOPs", "export", "Export SOP lists and reports", "Export SOP lists, compliance and reports.", "read", ["sop.EXPORT"]],
  ["sopcatalogue.manage", "SOPs", "button", "Manage SOP templates, categories and departments", "Edit the SOP templates, categories and departments.", "write", ["sop.MANAGE_TEMPLATES"]],
  ["sopaccess.manage", "SOPs", "button", "Manage SOP permissions", "Decide who may read, write and publish which SOPs.", "write", ["sop.MANAGE_PERMISSIONS"]],
  ["sopaudit.view", "SOPs", "page", "Read the SOP audit", "Read the SOP audit trail and history.", "read", ["sop.VIEW_AUDIT"]],
  ["sops.team", "SOPs", "scope", "Manage my department's SOPs", "Write and publish the SOPs of the department the person manages.", "write", ["sop.isSopManagerTier"], "team"],
  ["sops.all", "SOPs", "scope", "Manage every SOP", "Write and publish every department's SOPs.", "write", ["sop.isSopAdmin"], "all"],
];

export const PLAYBOOK_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
