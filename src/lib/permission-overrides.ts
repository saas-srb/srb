/**
 * Shared resolver for the Director's per-user permission overrides. Every
 * module's capability predicates (e.g. `canManageProjects` in `pms-roles.ts`)
 * are built on this: `super_admin` always bypasses overrides entirely (so a
 * bad override can never lock out a super_admin, including on another
 * super_admin's account — see `src/lib/commandos/admin-users.ts`), otherwise an
 * explicit override wins, otherwise the module's own role-based default
 * applies unchanged. Overrides are additive and absent-by-default: an
 * `admin_users` row with no `permissionOverrides` behaves exactly as before
 * this feature existed.
 *
 * Deliberately NOT override-aware: each module's coarse "tier" gates
 * (`hasXAccess`, `hasXStaffRole`) — an override can only add or remove
 * capability for someone who already clears their module's tier gates via an
 * existing role; it can't promote a portal-tier user into the staff area.
 * See the comment on each module's `(staff)/layout.tsx`.
 */

export interface RoleContext {
  roles: readonly string[];
  permissionOverrides?: Record<string, boolean> | null;
}

export function resolvePermission(ctx: RoleContext, key: string, fallback: () => boolean): boolean {
  if (ctx.roles.includes("super_admin")) return true;
  const override = ctx.permissionOverrides?.[key];
  if (override !== undefined) return override;
  return fallback();
}
