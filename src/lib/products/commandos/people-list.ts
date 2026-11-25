import "server-only";
import { getDb } from "@/lib/mongodb";
import { legacyToAccess } from "@/lib/access/adapter";
import { PRODUCTS } from "@/lib/access/catalogue";
import { WORKSPACE_PRODUCT } from "@/lib/access/complete";
import { listDepartments, listDesignations, listTeams } from "@/lib/platform/organization";
import { searchAdminUsers, DIRECTOR_DESIGNATION_ID, type AdminUserRow, type StatusFilter } from "@/lib/products/commandos/admin-users";
import { isHiddenAccessProduct, splitPicked } from "@/lib/products/commandos/people";
import { hiddenProducts } from "@/lib/platform/products/visible";

/** One line of the People list: the account plus where the person sits in the organization and how many products they can open. */
export interface PersonRow extends AdminUserRow {
  departments: string[];
  teams: string[];
  designations: string[];
  /** Products (other than the Workspace) the person can open; Directors reach every product. */
  productsCount: number;
  productsTotal: number;
  isDirector: boolean;
}

export interface PeopleFilter {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: StatusFilter;
  departmentId?: string;
  teamId?: string;
  designationId?: string;
  userType?: "employee" | "contractor" | "partner" | "system";
  sortBy?: "createdAt" | "email" | "lastLoginAt";
  sortDir?: "asc" | "desc";
}

/** Everyone who belongs to a department/team/designation: by the saved lists, or by their HR file for people made before the lists existed. */
async function organizationFilter(f: PeopleFilter): Promise<Record<string, unknown> | undefined> {
  const db = await getDb();
  const and: Record<string, unknown>[] = [];
  const add = async (listField: string, hrField: string, id: string | undefined, extraOr: Record<string, unknown>[] = []) => {
    if (!id) return;
    const emps = await db.collection("hrms_employees").find({ [`professional.${hrField}`]: id, deletedAt: null }, { projection: { _id: 1 } }).limit(5000).toArray();
    and.push({ $or: [{ [listField]: id }, ...(emps.length ? [{ employeeId: { $in: emps.map((e) => String(e._id)) } }] : []), ...extraOr] });
  };
  await add("departmentIds", "departmentId", f.departmentId);
  await add("teamIds", "teamId", f.teamId);
  await add("designationIds", "designationId", f.designationId, [{ designationId: f.designationId }, { customRoleIds: f.designationId }]);
  return and.length ? { $and: and } : undefined;
}

export async function listPeople(f: PeopleFilter = {}) {
  const extra = await organizationFilter(f);
  const res = await searchAdminUsers({
    page: f.page, pageSize: f.pageSize ?? 20, search: f.search, status: f.status, userType: f.userType, sortBy: f.sortBy, sortDir: f.sortDir, extra,
  });
  const [departments, teams, designations] = await Promise.all([listDepartments({ includeArchived: true }), listTeams({ includeArchived: true }), listDesignations({ includeArchived: true })]);
  const db = await getDb();
  const empIds = res.docs.map((d) => d.employeeId).filter((x): x is string => Boolean(x));
  const emps = empIds.length ? await db.collection<{ _id: string; professional?: { departmentId?: string | null; teamId?: string | null; designationId?: string | null } }>("hrms_employees").find({ _id: { $in: empIds } }).toArray() : [];
  const empById = new Map(emps.map((e) => [e._id, e.professional ?? {}]));
  const name = (list: { _id: string; name?: string; title?: string }[], ids: string[]) => ids.map((id) => list.find((x) => x._id === id)).map((x) => x?.name ?? x?.title).filter((x): x is string => Boolean(x));
  const hidden = await hiddenProducts();
  const counted = (p: string) => p !== WORKSPACE_PRODUCT && !isHiddenAccessProduct(p, hidden);
  const totalProducts = PRODUCTS.filter(counted).length;

  const items: PersonRow[] = res.items.map((row, i) => {
    const doc = res.docs[i];
    const hr = doc.employeeId ? empById.get(doc.employeeId) : undefined;
    const one = (x?: string | null) => (x ? [x] : []);
    const isDirector = row.roles.includes("super_admin");
    const dIds = doc.departmentIds ?? one(hr?.departmentId);
    const tIds = doc.teamIds ?? one(hr?.teamId);
    const gIds = doc.designationIds ?? one(doc.designationId && doc.designationId !== DIRECTOR_DESIGNATION_ID ? doc.designationId : hr?.designationId);
    const desig = isDirector ? ["Director"] : name(designations, gIds);
    const access = doc.access ?? legacyToAccess({ roles: row.roles, permissionOverrides: row.permissionOverrides }).access;
    const productsCount = isDirector ? totalProducts : Object.keys(splitPicked(access)).filter(counted).length;
    return { ...row, departments: name(departments, dIds), teams: name(teams, tIds), designations: desig.length ? desig : [row.designation !== "—" ? row.designation : "—"], productsCount, productsTotal: totalProducts, isDirector };
  });
  return { ...res, items };
}
