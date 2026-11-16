import { notFound } from "next/navigation";
import PeopleHarness, { type HarnessData } from "./PeopleHarness";
import { buildAccessUi } from "@/lib/access/ui-model";
import { checkAccess } from "@/lib/products/commandos/people";
import { cleanDetails, seatVerdict } from "@/lib/products/commandos/people-rules";
import { toOptions } from "@/lib/platform/organization/rules";
import { CATALOGUE, featuresOf } from "@/lib/access/catalogue";
import type { PersonRow } from "@/lib/products/commandos/people-list";
import type { AccessMap } from "@/lib/access/types";

/**
 * Development-only: People & Access over SAMPLE rows (no sign-in, no database; 404 in production). `?view=list|step1|step2|step3|withheld`.
 * Used by scripts/shot-people.ts. The sample people exist only here.
 */
export const dynamic = "force-dynamic";

const DEPTS = [{ _id: "d1", name: "Operations", code: "OPS" }, { _id: "d2", name: "Finance", code: "FIN" }, { _id: "d3", name: "Sales", code: "SAL" }];
const TEAMS = [{ _id: "t1", name: "Field team", departmentId: "d1" }, { _id: "t2", name: "Accounts payable", departmentId: "d2" }, { _id: "t3", name: "Inside sales", departmentId: "d3" }];
const DES = [{ _id: "g1", title: "Operations Manager", departmentId: "d1" }, { _id: "g2", title: "Coordinator", departmentId: "d1" }, { _id: "g3", title: "Accountant", departmentId: "d2" }, { _id: "g4", title: "Sales Executive", departmentId: "d3" }];

const person = (i: number, name: string, email: string, status: PersonRow["status"], dept: string, team: string, des: string, products: number, last: string | null, director = false): PersonRow => ({
  _id: `u${i}`, email, roles: director ? ["super_admin"] : ["employee"], permissionOverrides: {}, manualRoles: [], manualOverrides: {}, customRoleIds: [], employeeId: `e${i}`, mustChangePassword: false, locked: false,
  createdAt: "2026-05-02T09:00:00.000Z", lastLoginAt: last, status, statusReason: "", statusChangedAt: null, lastWorkingDay: null, name, designation: des, designationId: null, savedRoles: [], userType: "employee", notes: "",
  departments: [dept], teams: [team], designations: [des], productsCount: products, productsTotal: 16, isDirector: director,
});

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const view = (["list", "step1", "step2", "step3", "withheld"].includes(sp.view ?? "") ? sp.view : "list") as HarnessData["view"];
  const model = buildAccessUi();
  const org = { departments: toOptions("department", DEPTS), teams: toOptions("team", TEAMS), designations: toOptions("designation", DES) };
  const rows = [
    person(1, "Vijay Pal", "vijay@sample.test", "active", "Operations", "Field team", "Director", 16, "2026-11-14T10:20:00.000Z", true),
    person(2, "Meera Iyer", "meera@sample.test", "active", "Operations", "Field team", "Operations Manager", 3, "2026-11-13T08:05:00.000Z"),
    person(3, "Ravi Menon", "ravi@sample.test", "on_leave", "Finance", "Accounts payable", "Accountant", 2, "2026-11-10T16:40:00.000Z"),
    person(4, "Asha Rao", "asha@sample.test", "probation", "Sales", "Inside sales", "Sales Executive", 2, null),
    person(5, "Priya Nair", "priya@sample.test", "suspended", "Operations", "Field team", "Coordinator", 1, "2026-10-02T11:00:00.000Z"),
    person(6, "Karan Shah", "karan@sample.test", "active", "Finance", "Accounts payable", "Accountant", 4, "2026-11-14T07:30:00.000Z"),
  ];
  const sprint = featuresOf("sprintos").filter((e) => e.kind !== "tier");
  const finance = featuresOf("cashflow-ai").filter((e) => e.kind !== "tier");
  const picked: AccessMap = {
    sprintos: Object.fromEntries(sprint.map((e) => [e.key, e.level])),
    "cashflow-ai": Object.fromEntries(finance.filter((e) => e.level === "read").map((e) => [e.key, "read"])),
    // CyberVault is a finished product: picked in micro features (a partial person: sees credentials and notes of the assigned clients, adds notes).
    cybervault: { "cybervault.credentials.view": "read", "cybervault.notes.view": "read", "cybervault.clients.view": "read", "cybervault.notes.create": "write" },
  };
  const details = cleanDetails({ name: "Meera Iyer", email: "meera@sample.test", phone: "+91 90000 11111", joiningDate: "2026-06-01", userType: "employee", departmentIds: ["d1"], teamIds: ["t1"], designationIds: ["g1", "g2"], invite: "password" });

  // A person whose access cannot be fully applied to the older parts of the product: found by looking for a single feature the older checks cannot honour.
  let withheldPick: AccessMap | null = null;
  if (view === "withheld") {
    outer: for (const p of model.products) {
      if (p.key === "commandos") continue;
      for (const f of p.features) {
        const m: AccessMap = { [p.key]: { [f.key]: f.needs } };
        const c = checkAccess(m);
        if (c.withheld.length > 0 && c.widened.length === 0) { withheldPick = m; break outer; }
      }
    }
  }
  const useMap = withheldPick ?? picked;
  const check = checkAccess(useMap);
  const validation = { ok: true, errors: {}, details, check, seats: seatVerdict({ used: 6, limit: 10, takesSeat: true }), refusal: null };
  void CATALOGUE;
  const data: HarnessData = { view, model, org, rows, details, picked: useMap, openProduct: Object.keys(useMap)[0] ?? "sprintos", validation };
  return <PeopleHarness data={data} />;
}
