import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { microByKey } from "@/lib/access/micro";
import { legacyToAccess } from "@/lib/access/adapter";
import type { PlaybookPermission } from "@/lib/playbook-roles";
import type { SopPermission } from "@/lib/sop-roles";

/**
 * Playbook access from the person's micro features. Pure (no server-only imports): pages, actions, routes, library code and Ask AI use one rule.
 * `pbCan(who, "documents.create")` where `who` is anything that carries the person's `subject` (the signed-in user, the SOP viewer, an actor built from either).
 * The old permission names (`VIEW`, `CREATE`, `MANAGE_TEMPLATES` ...) map one to one onto the features, so code that still passes a permission name keeps working through `pbDoc` and `pbSop`.
 */
export type PbHolder = { subject?: AccessSubject | null; roles?: readonly string[]; permissionOverrides?: Record<string, boolean> | null; overrides?: Record<string, boolean> | null };

/** The person's access subject: the one they carry, or (for a bare actor built from roles only, such as a script or a background job) the one their roles and overrides give. */
function subjectOf(h: PbHolder): AccessSubject | null {
  if (h.subject) return h.subject;
  if (!h.roles) return null;
  return legacyToAccess({ roles: h.roles, permissionOverrides: h.permissionOverrides ?? h.overrides ?? null }) as AccessSubject;
}

const PRODUCT = "playbook-ai";

/** The one check. `key` is `<module>.<feature>` without the product. An unknown key, or a holder with no access subject, is never allowed. */
export function pbCan(holder: PbHolder | null | undefined, key: string): boolean {
  const subject = holder ? subjectOf(holder) : null;
  if (!subject) return false;
  const full = `${PRODUCT}.${key}`;
  const m = microByKey(full);
  return Boolean(m) && accessCan(subject, PRODUCT, full, m!.level);
}

const DOC: Record<PlaybookPermission, string> = {
  VIEW: "documents.view", CREATE: "documents.create", EDIT: "documents.edit", COMMENT: "documents.comment", SUBMIT: "documents.submit", APPROVE: "documents.approve",
  ISSUE: "documents.issue", EXPORT: "documents.export", SHARE: "documents.share", SEND_FOR_SIGNATURE: "documents.sendsignature", USE_AI: "documents.useai",
  MANAGE_TEMPLATES: "templates.manage", REVIEW_TEMPLATES: "templates.review", MANAGE_BRAND: "brand.manage", MANAGE_VARIABLES: "variables.manage",
  MANAGE_RETENTION: "retention.manage", VIEW_AUDIT: "documentaudit.view", SETTINGS: "documentsettings.manage",
};
const SOP: Record<SopPermission, string> = {
  VIEW: "sops.view", CREATE: "sops.create", EDIT: "sops.edit", PUBLISH: "sops.publish", ASSIGN: "sops.assign", ACKNOWLEDGE: "sops.acknowledge", ARCHIVE: "sops.archive",
  DOWNLOAD: "sops.download", EXPORT: "sops.export", MANAGE_TEMPLATES: "sopcatalogue.manage", MANAGE_PERMISSIONS: "sopaccess.manage", VIEW_AUDIT: "sopaudit.view",
};

/** The micro feature key (without the product) an old SOP permission name maps to. */
export const sopFeatureKey = (permission: SopPermission): string => SOP[permission];

/** A document capability by its old permission name (`"VIEW"`, `"MANAGE_BRAND"` ...). */
export const pbDoc = (holder: PbHolder | null | undefined, permission: PlaybookPermission): boolean => pbCan(holder, DOC[permission]);
/** A SOP capability by its old permission name (`"VIEW"`, `"PUBLISH"` ...). */
export const pbSop = (holder: PbHolder | null | undefined, permission: SopPermission): boolean => pbCan(holder, SOP[permission]);

/** May the person write and publish every department's SOPs (the old SOP admin)? */
export const pbSeesAllSops = (holder: PbHolder | null | undefined): boolean => pbCan(holder, "sops.all");
/** Does the person manage a department's SOPs (the old manager tier)? */
export const pbManagesDepartment = (holder: PbHolder | null | undefined): boolean => pbCan(holder, "sops.team") || pbCan(holder, "sops.all");
