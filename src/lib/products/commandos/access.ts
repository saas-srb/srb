import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentHubUser, type CurrentHubUser } from "@/lib/hub-auth";
import { currentCompanyId, isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { listPanels, unavailablePanelKeys } from "@/lib/platform/panels/store";
import { whiteLabelProductName } from "@/lib/platform/panels/types";
import { getPlatformAccessForUser } from "@/lib/platform/console/roles";
import { writeBlockReason } from "@/lib/platform/billing/enforce";
import { navAllows, resolveNav, type NavContext, type ResolvedNav } from "@/lib/products/commandos/nav";

/**
 * Server side of the Workspace navigation (`nav.ts`): loads what the rules
 * need for a user of the CURRENT company (available products, platform
 * access) and answers "what may this user open" — for the sidebar, the Staff
 * Hub tiles and the settings cards — and "may this user open X" — for pages.
 * Both go through the same rule, so what is shown is what is enforced.
 */

export type WorkspaceUser = Pick<CurrentHubUser, "id" | "roles" | "permissionOverrides">;

/**
 * The Platform Console's own test (`console/access.ts`): the platform-owner
 * company AND a platform role (or the legacy super_admin fallback). Workspace
 * roles never grant it and it grants no Workspace permission.
 */
async function hasPlatformAccess(userId: string): Promise<boolean> {
  if (!(await isPlatformOwnerContext())) return false;
  return (await getPlatformAccessForUser(userId)) !== null;
}

export async function loadNavContext(user: WorkspaceUser): Promise<NavContext> {
  const companyId = await currentCompanyId();
  const [platformAccess, unavailable, registry] = await Promise.all([hasPlatformAccess(user.id), unavailablePanelKeys(companyId), listPanels()]);
  return {
    unavailablePanels: unavailable,
    panels: Object.fromEntries(registry.map((p) => [p.key, { name: whiteLabelProductName(p.name), description: p.description }])),
    user: { roles: user.roles, permissionOverrides: user.permissionOverrides ?? null },
    platformAccess,
  };
}

/** Everything `user` may open in the Workspace of the current company. */
export async function resolveWorkspaceNav(user: WorkspaceUser): Promise<ResolvedNav> {
  return resolveNav(await loadNavContext(user));
}

/** Whether `user` may open the nav item `key` (see `NAV_KEYS`). */
export async function checkWorkspaceAccess(user: WorkspaceUser, key: string): Promise<boolean> {
  return navAllows(await loadNavContext(user), key);
}

/** The signed-in user and their navigation, once per request (layout, page and cards share it). */
export const getWorkspaceNav = cache(async (): Promise<{ user: CurrentHubUser; nav: ResolvedNav } | null> => {
  const user = await getCurrentHubUser();
  return user ? { user, nav: await resolveWorkspaceNav(user) } : null;
});

/**
 * Page guard: the signed-in user, or a redirect — to sign-in when signed out,
 * to the Workspace when the item isn't theirs to open.
 */
export async function requireWorkspaceAccess(key: string): Promise<CurrentHubUser> {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (user.mustChangePassword) redirect("/commandos/change-password");
  if (!(await checkWorkspaceAccess(user, key))) redirect("/commandos");
  return user;
}

/**
 * Server-action guard: the signed-in user, or a thrown `Unauthorized` /
 * `Forbidden`. Hiding a button is never the boundary — every action of a
 * Workspace page calls this with the page's own nav key.
 */
export async function requireWorkspaceAction(key: string): Promise<CurrentHubUser> {
  const user = await getCurrentHubUser();
  if (!user) throw new Error("Unauthorized");
  if (user.mustChangePassword || !(await checkWorkspaceAccess(user, key))) throw new Error("Forbidden");
  // A suspended / canceled subscription is read-only everywhere — except the pages that exist to fix it (plan, invoices, usage, security).
  if (!READ_ONLY_OK.has(key)) {
    const readOnly = await writeBlockReason();
    if (readOnly) throw new Error(readOnly);
  }
  return user;
}

const READ_ONLY_OK = new Set(["company.billing", "company.invoices", "company.usage", "company.security", "company.backups"]);

/** Route-handler guard: the user, or the 401 / 403 response to return. */
export async function authorizeWorkspaceApi(key: string): Promise<{ ok: true; user: CurrentHubUser } | { ok: false; response: NextResponse }> {
  const user = await getCurrentHubUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.mustChangePassword || !(await checkWorkspaceAccess(user, key))) return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, user };
}
