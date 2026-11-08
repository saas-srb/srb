import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentHubUser, type CurrentHubUser } from "@/lib/hub-auth";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getPlatformAccessForUser, type PlatformAccess } from "./roles";
import { hasPermission, type PlatformPermission } from "./permissions";

/**
 * Platform Console access. The product is for the platform owner company's
 * accounts only: on any other company's host it doesn't exist (404) — a
 * workspace must not even learn it's there.
 *
 * Who gets in, and what they can do, comes from platform roles (`roles.ts`).
 * An owner-company super_admin with no role assigned is a Platform Owner
 * (the pre-roles behaviour), so nobody is locked out.
 *
 *   requirePlatformAccess()        — any platform user (layout, dashboard)
 *   requirePlatformPermission(p)   — pages: needs permission p
 *   checkPlatformPermission(p)     — server actions: returns an error instead of redirecting
 *   requirePlatformAdmin()         — full access (Platform Owner); unchanged for existing callers
 *   can(user, p)                   — hide buttons the user can't use
 */

export interface PlatformUser extends CurrentHubUser {
  platform: PlatformAccess;
}

/** Per request: the signed-in owner-company user with their platform access, or a reason. */
const loadPlatformUser = cache(async (): Promise<{ user: PlatformUser } | { reason: "not_owner" | "signed_out" | "no_access" }> => {
  if (!(await isPlatformOwnerContext())) return { reason: "not_owner" };
  const hub = await getCurrentHubUser();
  if (!hub) return { reason: "signed_out" };
  const access = await getPlatformAccessForUser(hub.id);
  if (!access) return { reason: "no_access" };
  return { user: { ...hub, platform: access } };
});

async function gate(): Promise<PlatformUser> {
  const res = await loadPlatformUser();
  if ("user" in res) return res.user;
  if (res.reason === "not_owner") notFound();
  if (res.reason === "signed_out") redirect("/commandos/login");
  redirect("/commandos");
}

export function can(user: Pick<PlatformUser, "platform"> | null | undefined, perm: PlatformPermission): boolean {
  return Boolean(user && hasPermission(user.platform.permissions, perm));
}

/** Any platform user — the product shell and the dashboard. */
export async function requirePlatformAccess(): Promise<PlatformUser> {
  return gate();
}

/** Pages: needs `perm`; otherwise back to the dashboard with a notice. */
export async function requirePlatformPermission(perm: PlatformPermission): Promise<PlatformUser> {
  const user = await gate();
  if (!can(user, perm)) redirect(`/console?denied=${encodeURIComponent(perm)}`);
  return user;
}

/** Server actions: same check, but returns an error the form can show. */
export async function checkPlatformPermission(perm: PlatformPermission): Promise<{ ok: true; user: PlatformUser } | { ok: false; error: string }> {
  const user = await gate();
  if (!can(user, perm)) return { ok: false, error: "Your platform role doesn't allow this." };
  return { ok: true, user };
}

/**
 * Full Platform Console access (Platform Owner, or a legacy super_admin). Kept
 * for existing callers; pages not yet moved to a specific permission stay
 * owner-only, so a limited role never sees them by accident.
 */
export async function requirePlatformAdmin(): Promise<PlatformUser> {
  const user = await gate();
  if (!user.platform.permissions.includes("*")) redirect("/console?denied=owner");
  return user;
}
