import "server-only";
import { toOptions, type OrgOption } from "./rules";
import { listDepartments, listDesignations, listTeams } from "./store";

/** Everything a page needs to render `OrgPicker`s, in one call (live rows only). */
export async function loadOrgOptions(): Promise<{ departments: OrgOption[]; teams: OrgOption[]; designations: OrgOption[] }> {
  const [d, t, g] = await Promise.all([listDepartments(), listTeams(), listDesignations()]);
  return { departments: toOptions("department", d), teams: toOptions("team", t), designations: toOptions("designation", g) };
}
