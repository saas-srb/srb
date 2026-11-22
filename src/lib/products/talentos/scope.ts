import "server-only";
import { type Me, type PeopleScope, ownOrStaff, peopleFilter } from "@/lib/access/scope";
import { hrScope, hrCan, type HrHolder } from "@/lib/talentos-access";
import { descendantEmployeeIds } from "@/lib/products/talentos/employees";

/**
 * Whose employee records a signed-in person may reach in a module: the shared own / reporting-line / everyone rule for TalentOS.
 * `ids` is the list to confine a query to (undefined = everyone, so no filter); `me` is what `ownOrStaff` / `peopleFilter` need.
 */
export interface HrReach {
  scope: PeopleScope;
  /** The employee ids the person may reach (undefined = every employee). Own = just themselves; team = themselves and everyone who reports to them, directly or not. */
  ids: string[] | undefined;
  me: Me;
}

type HrPerson = HrHolder & { employeeId: string | null };

export async function hrReach(user: HrPerson, module: Parameters<typeof hrScope>[1]): Promise<HrReach> {
  const scope = hrScope(user, module);
  const mine = user.employeeId ?? null;
  if (scope === "all") return { scope, ids: undefined, me: { id: mine } };
  if (scope === "none" || !mine) return { scope, ids: [], me: { id: mine } };
  if (scope === "own") return { scope, ids: [mine], me: { id: mine } };
  const line = await descendantEmployeeIds(mine);
  return { scope, ids: line, me: { id: mine, line: new Set(line) } };
}

/** May this person act on this employee's record in the module? (The record's owner is the employee it is about.) */
export const reaches = (reach: HrReach, employeeId: string | null | undefined): boolean => ownOrStaff(reach.scope, employeeId, reach.me);

/** The Mongo filter that confines a query on `field` to the person's reach (null = nothing reachable: do not query). */
export const reachFilter = (reach: HrReach, field: string): Record<string, unknown> | null => peopleFilter(reach.scope, field, reach.me);

/** Throws "Forbidden" unless the person holds `key` (write features in particular) AND reaches the employee. The one check every action in a scoped module makes. */
export async function requireHrAct(user: HrPerson, module: Parameters<typeof hrScope>[1], key: string, employeeId: string | null | undefined): Promise<HrReach> {
  if (!hrCan(user, key)) throw new Error("Forbidden");
  const reach = await hrReach(user, module);
  if (!reaches(reach, employeeId)) throw new Error("Forbidden");
  return reach;
}
