import "server-only";
import { cache } from "react";
import { getCurrentDlmsUser } from "@/lib/dlms-auth";
import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import type { Level } from "@/lib/access/types";
import { loadAccessSubject } from "@/lib/access/server";
import { microByKey } from "@/lib/access/micro";
import type { RoleContext } from "@/lib/permission-overrides";
import { getAccess } from "@/lib/products/cybervault/access";
import type { RecordType, Scope } from "@/lib/products/cybervault/constants";

export interface DlmsViewer {
  userId: string;
  email: string;
  roles: string[];
  overrides: Record<string, boolean>;
  ctx: RoleContext;
  /** The person's access (micro features of CyberVault). Every check goes through `can(viewer, "<module>.<feature>")`. */
  subject: AccessSubject;
  /** Holds "See every vault": sees every scope; everyone else only what they were assigned. */
  seesAll: boolean;
  companyAccess: boolean;
  clientIds: string[];
}

const PRODUCT = "cybervault";

/** The one check. `key` is `<module>.<feature>` without the product, e.g. "credentials.reveal". An unknown key is never allowed (the coverage test also fails on it). */
export function can(viewer: Pick<DlmsViewer, "subject">, key: string, level?: Level): boolean {
  const full = `${PRODUCT}.${key}`;
  const m = microByKey(full);
  if (!m) return false;
  return accessCan(viewer.subject, PRODUCT, full, level ?? m.level);
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<DlmsViewer | null> => {
  const user = await getCurrentDlmsUser();
  if (!user) return null;
  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  const subject = (await loadAccessSubject(user.id)) ?? { isDirector: false, access: {} };
  const seesAll = can({ subject }, "scope.all");
  const grant = seesAll ? null : await getAccess(user.id);
  return {
    userId: user.id,
    email: user.email,
    roles: user.roles,
    overrides: user.permissionOverrides,
    ctx,
    subject,
    seesAll,
    companyAccess: seesAll || Boolean(grant?.companyAccess),
    clientIds: grant?.clientIds ?? [],
  };
});

/** The micro-feature group of a record type. */
export const TYPE_GROUP: Record<RecordType, string> = { credential: "credentials", document: "documents", link: "urls", note: "notes" };
/** The micro key (without the product) for an operation on a record type. */
export const typeKey = (type: RecordType, what: "view" | "create" | "edit" | "delete") => `${TYPE_GROUP[type]}.${type === "document" && (what === "create" || what === "edit") ? "upload" : what}`;
export const canType = (viewer: Pick<DlmsViewer, "subject">, type: RecordType, what: "view" | "create" | "edit" | "delete") => can(viewer, typeKey(type, what));
/** A write needs the record permission of the type: refused (ForbiddenError) when missing. */
export function needType(viewer: Pick<DlmsViewer, "subject">, type: RecordType, what: "create" | "edit" | "delete"): void {
  if (!canType(viewer, type, what)) throw new ForbiddenError(`${TYPE_GROUP[type]}.${what}`);
}

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<DlmsViewer> {
  const v = await getViewer();
  if (!v) throw new Error("Unauthorized");
  return v;
}

export class ForbiddenError extends Error {
  constructor(public permission?: string) {
    super("Forbidden");
  }
}

/** A user-facing validation failure: its message is safe to show as-is. */
export class DlmsInputError extends Error {}

/** May the viewer SEE records in this scope? (Scope and the vault page permission only; the caller also checks the record type's view feature.) */
export function canReadScope(viewer: DlmsViewer, scope: Scope, clientId: string | null): boolean {
  if (scope === "company") return can(viewer, "company.view") && (viewer.seesAll || viewer.companyAccess);
  if (!can(viewer, "clients.view")) return false;
  return viewer.seesAll || (clientId !== null && viewer.clientIds.includes(clientId));
}

/** May the viewer CHANGE records in this scope? Needs scope access AND the company/client management feature. */
export function canWriteScope(viewer: DlmsViewer, scope: Scope, clientId: string | null): boolean {
  if (!canReadScope(viewer, scope, clientId)) return false;
  return can(viewer, scope === "company" ? "company.manage" : "clients.manage");
}

/** Mongo filter restricting a vault collection to what the viewer may see: the record type's view feature, then the company/client scope. Every list/query goes through this. */
export function scopeFilter(viewer: DlmsViewer, type: RecordType): Record<string, unknown> {
  if (!canType(viewer, type, "view")) return { _id: "__none__" };
  const or: Record<string, unknown>[] = [];
  if (can(viewer, "company.view") && (viewer.seesAll || viewer.companyAccess)) or.push({ scope: "company" });
  if (can(viewer, "clients.view")) {
    if (viewer.seesAll) or.push({ scope: "client" });
    else if (viewer.clientIds.length > 0) or.push({ scope: "client", clientId: { $in: viewer.clientIds } });
  }
  return or.length > 0 ? { $or: or } : { _id: "__none__" };
}
