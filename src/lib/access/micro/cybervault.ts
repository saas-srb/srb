import type { MicroFeature } from "./types";

const P = "cybervault";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all"];

/** What everybody given CyberVault gets: they can open the dashboard (which shows only what their other features allow). */
const BASELINE = new Set(["dashboard.view"]);

const ROWS: Row[] = [
  // Dashboard
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the CyberVault dashboard: totals, recent additions and expiring items within the person's vaults.", "read", ["dlms.VIEW"]],
  ["dashboard.activity", "Dashboard", "section", "See the activity feed", "See the recent activity list on the dashboard and on each vault overview (without it the person sees only their own actions on the dashboard).", "read", ["dlms.VIEW_AUDIT"]],
  // Scope
  ["scope.all", "Which vaults", "scope", "See every vault, not only assigned ones", "Without this a person sees only the company vault and the clients they were assigned to (set under Assign vaults). With it they see the company vault and every client.", "read", ["dlms.isDlmsManagerTier"], "all"],
  // Company vault
  ["company.view", "Company vault", "page", "Open the company vault", "Open the company vault and its overview (when the person has access to it).", "read", ["dlms.VIEW"]],
  ["company.manage", "Company vault", "action", "Change company vault records", "Add, edit, archive and delete records that belong to the company vault (together with the record permissions below).", "write", ["dlms.MANAGE_COMPANY"]],
  // Clients
  ["clients.view", "Clients vault", "page", "Open the clients vault", "Open the list of clients and a client's vault.", "read", ["dlms.VIEW"]],
  ["clients.manage", "Clients vault", "action", "Change client vault records", "Add, edit, archive and delete records that belong to a client (together with the record permissions below).", "write", ["dlms.MANAGE_CLIENTS"]],
  // Credentials
  ["credentials.view", "Credentials", "page", "See credentials", "Open the Credential Vault and the credentials tab of a vault. Passwords stay masked.", "read", ["dlms.VIEW"]],
  ["credentials.create", "Credentials", "button", "Add a credential", "Add a credential record, with its password.", "write", ["dlms.CREATE"]],
  ["credentials.edit", "Credentials", "button", "Edit, archive or restore a credential", "Edit a credential, change or clear its password, archive or restore it.", "write", ["dlms.EDIT"]],
  ["credentials.delete", "Credentials", "button", "Delete a credential", "Delete a credential record.", "write", ["dlms.DELETE"]],
  ["credentials.reveal", "Credentials", "button", "Reveal or copy a password", "Show or copy a stored password for a short time. Every reveal is logged.", "write", ["dlms.REVEAL"]],
  // Documents
  ["documents.view", "Documents", "page", "See documents", "Open the Document Vault and the documents tab of a vault (file contents need the download permission).", "read", ["dlms.VIEW"]],
  ["documents.upload", "Documents", "button", "Upload or replace a document", "Upload a document or a new version, and edit a document's details, archive or restore it.", "write", ["dlms.MANAGE_DOCUMENTS"]],
  ["documents.download", "Documents", "export", "Preview and download documents", "Preview and download the stored files.", "read", ["dlms.DOWNLOAD"]],
  ["documents.delete", "Documents", "button", "Delete a document", "Delete a document from a vault.", "write", ["dlms.DELETE"]],
  // URLs and accounts
  ["urls.view", "URLs & accounts", "page", "See URLs and accounts", "Open URLs & Accounts and the tab of a vault.", "read", ["dlms.VIEW"]],
  ["urls.create", "URLs & accounts", "button", "Add a URL or account", "Add a URL or account record.", "write", ["dlms.CREATE"]],
  ["urls.edit", "URLs & accounts", "button", "Edit, archive or restore a URL or account", "Edit, archive or restore a URL or account record.", "write", ["dlms.EDIT"]],
  ["urls.delete", "URLs & accounts", "button", "Delete a URL or account", "Delete a URL or account record.", "write", ["dlms.DELETE"]],
  // Notes
  ["notes.view", "Notes", "page", "See notes", "Open Notes and the tab of a vault.", "read", ["dlms.VIEW"]],
  ["notes.create", "Notes", "button", "Add a note", "Add a note to the company vault or to a client vault.", "write", ["dlms.CREATE"]],
  ["notes.edit", "Notes", "button", "Edit, archive or restore a note", "Edit, archive or restore a note.", "write", ["dlms.EDIT"]],
  ["notes.delete", "Notes", "button", "Delete a note", "Delete a note from a vault.", "write", ["dlms.DELETE"]],
  // Expiry
  ["expiry.view", "Expiry & alerts", "page", "Open Expiry & Alerts", "See everything that is expired or about to expire in the person's vaults.", "read", ["dlms.VIEW"]],
  // Activity
  ["activity.view", "Activity log", "page", "Read the activity log", "Open the CyberVault activity log (who opened, revealed or changed what).", "read", ["dlms.VIEW_AUDIT"]],
  // Settings
  ["settings.alerts", "Settings", "section", "Change alert settings", "Change the expiry warning days and whether expiry alerts are on.", "write", ["dlms.MANAGE_SETTINGS"]],
  ["settings.assign", "Settings", "section", "Assign vaults to people", "Choose which clients and the company vault each person can open.", "write", ["dlms.MANAGE_ACCESS"]],
];

export const CYBERVAULT_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
