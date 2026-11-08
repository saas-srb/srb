import "server-only";
import * as A from "@/app/(products)/cybervault/(protected)/actions";
import { dlmsCan, type DlmsPermission } from "@/lib/dlms-roles";
import { requireViewer, scopeFilter } from "@/lib/products/cybervault/viewer";
import { CREDENTIAL_TYPES, DOCUMENT_CATEGORIES, LINK_TYPES, NOTE_TYPES, RECORD_TYPES, SCOPES } from "@/lib/products/cybervault/constants";
import { viaAction, f, str, values } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, FieldDef, Json } from "@/lib/ai/agent/types";

/**
 * The document & credential vault (DLMS). The agent can find records, keep notes and links, change status, and manage access and settings.
 * It never sees, takes or stores a password — those are entered and revealed in the vault itself. Everything is limited to the company or
 * client vaults the person has been granted.
 */

const ctx = (u: AgentUser) => ({ roles: u.roles, permissionOverrides: u.permissionOverrides });
const can = (p: DlmsPermission) => (u: AgentUser) => dlmsCan(ctx(u), p);
const vaultScope = async (): Promise<Json | null> => {
  try {
    return scopeFilter(await requireViewer()) as Json;
  } catch {
    return null;
  }
};
const soft = { deletedAt: null };
const base = (key: string, label: string, description: string, collection: string, extra: Partial<EntityDef> = {}): EntityDef => ({ key, panel: "dlms", label, description, collection, idType: "string", baseFilter: soft, titleField: "name", search: ["name", "category", "notes"], read: "any", allowRead: can("VIEW"), scope: vaultScope, ...extra });

export const DLMS_ENTITIES: EntityDef[] = [
  base("dlms.credential", "Credential record", "Saved logins (type, name, username, login URL, expiry). Passwords are never shown.", "dlms_credentials", { hide: ["passwordEnc", "passwordUpdatedAt"] }),
  base("dlms.document", "Document", "Documents in the vault: name, category, expiry date, versions (file contents are not shown).", "dlms_documents", { hide: ["versions", "storageKey"] }),
  base("dlms.link", "URL / account", "Important links and accounts (type, URL, notes).", "dlms_links"),
  base("dlms.note", "Note", "Notes and instructions kept with the vault.", "dlms_notes"),
  { key: "dlms.access", panel: "dlms", label: "Vault access", description: "Who can open the company vault and which client vaults.", collection: "dlms_access", read: "staff", allowRead: can("MANAGE_ACCESS") },
  { key: "dlms.activity", panel: "dlms", label: "Audit log", description: "Who opened, revealed or changed what in the vault.", collection: "dlms_activity_logs", idType: "string", search: ["entityLabel", "summary", "actorEmail"], read: "admin", allowRead: can("VIEW_AUDIT") },
];

const SCOPE = [...SCOPES] as string[];
const target: FieldDef[] = [f.enum("scope", "Vault", SCOPE, true), f.str("clientId", "Client id (for a client vault)")];
const act = (key: string, label: string, description: string, params: FieldDef[], perm: DlmsPermission, run: (v: Json) => Promise<unknown>, success: string, destructive = false): ActionDef => ({
  key, panel: "dlms", label, description, params, level: "any", allow: can(perm), destructive, run: (v) => viaAction(() => run(v), success),
});

export const DLMS_ACTIONS: ActionDef[] = [
  act("dlms.save_credential", "Add or edit a credential record (without the password)", "Records which account exists (name, type, username, login URL, expiry, notes). The password is NOT taken here — add it in the vault itself.", [f.str("id", "Credential id to edit (leave out to add)"), ...target, f.str("name", "Name", true), f.enum("category", "Account type", values(CREDENTIAL_TYPES), true), f.str("username", "Username"), f.str("loginUrl", "Login URL"), f.date("expiryDate", "Expires on"), f.text("notes", "Notes")], "CREATE", (v) => { const { id, password: _p, ...rest } = v; void _p; return A.saveCredentialAction(str(id), rest); }, "Credential saved."),
  act("dlms.save_link", "Add or edit a URL / account", "A link or account record.", [f.str("id", "Link id to edit (leave out to add)"), ...target, f.str("name", "Name", true), f.enum("category", "Type", values(LINK_TYPES), true), f.str("url", "URL"), f.str("username", "Username"), f.date("expiryDate", "Expires on"), f.text("notes", "Notes")], "CREATE", (v) => { const { id, ...rest } = v; return A.saveLinkAction(str(id), rest); }, "Link saved."),
  act("dlms.save_note", "Add or edit a note", "A note kept in the vault.", [f.str("id", "Note id to edit (leave out to add)"), ...target, f.str("name", "Title", true), f.enum("category", "Kind", values(NOTE_TYPES), true), f.text("body", "The note", true)], "CREATE", (v) => { const { id, ...rest } = v; return A.saveNoteAction(str(id), rest); }, "Note saved."),
  act("dlms.set_status", "Archive or restore a vault record", "Archive a credential, document, link or note (or make it active again).", [f.enum("type", "Record type", [...RECORD_TYPES], true), f.str("id", "Record id", true), f.enum("status", "Status", ["active", "archived"], true)], "EDIT", (v) => A.setStatusAction(String(v.type), String(v.id), String(v.status)), "Status changed."),
  act("dlms.delete_record", "Delete a vault record", "Permanently delete a credential, document, link or note.", [f.enum("type", "Record type", [...RECORD_TYPES], true), f.str("id", "Record id", true)], "DELETE", (v) => A.deleteRecordAction(String(v.type), String(v.id)), "Record deleted.", true),
  act("dlms.save_access", "Set who can open which vaults", "Give a user access to the company vault and/or specific client vaults (replaces their current access).", [f.ref("userId", "User (workspace.user id)", "workspace.user", true), f.bool("companyAccess", "Can open the company vault"), f.list("clientIds", "Client ids they can open (pms.client)")], "MANAGE_ACCESS", (v) => A.saveAccessAction(String(v.userId), { companyAccess: v.companyAccess === true, clientIds: (v.clientIds as string[]) ?? [] }), "Access updated.", true),
  act("dlms.save_settings", "Change vault settings", "How many days before expiry to warn, and whether expiry alerts are on.", [f.num("warnDays", "Warn this many days before expiry", true), f.bool("alertsEnabled", "Expiry alerts on")], "MANAGE_SETTINGS", (v) => A.saveSettingsAction({ warnDays: Number(v.warnDays) || 30, alertsEnabled: v.alertsEnabled === true }), "Settings saved."),
];
void DOCUMENT_CATEGORIES;
