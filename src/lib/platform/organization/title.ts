/**
 * THE person's title: what every screen, menu, chip and email calls a person. It is the designation chosen when the person was created
 * (organization service), with the department as an optional second line. It is NEVER a product role name ("Employee", "Manager", "Staff"):
 * a product role is an access detail, not who somebody is. A person with no designation is "Team member". Pure and client-safe.
 */
export const FALLBACK_TITLE = "Team member";
export const DIRECTOR_DESIGNATION_ID = "director";
export const DIRECTOR_DESIGNATION_TITLE = "Director";

export interface TitleSource { designationId?: string | null; designationIds?: readonly string[] | null }
export interface TitleLookups {
  designations: ReadonlyMap<string, { title: string; departmentId?: string | null }>;
  departments: ReadonlyMap<string, string>;
}
export interface DisplayTitle { title: string; department: string | null; /** "Engineering · Senior Developer" or just the title */ line: string }

/** The main designation is the first one the person holds (`designationId`, else the first of `designationIds`). */
export function displayTitle(person: TitleSource | null | undefined, lookups: TitleLookups): DisplayTitle {
  const id = person?.designationId || person?.designationIds?.[0] || null;
  if (id === DIRECTOR_DESIGNATION_ID) return { title: DIRECTOR_DESIGNATION_TITLE, department: null, line: DIRECTOR_DESIGNATION_TITLE };
  const d = id ? lookups.designations.get(id) : undefined;
  if (!d?.title) return { title: FALLBACK_TITLE, department: null, line: FALLBACK_TITLE };
  const department = (d.departmentId ? lookups.departments.get(d.departmentId) : null) ?? null;
  return { title: d.title, department, line: department ? `${department} · ${d.title}` : d.title };
}
