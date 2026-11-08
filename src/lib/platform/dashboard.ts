import "server-only";
import { getDb } from "@/lib/mongodb";
import { accessibleAreas, type AccessUser, type Area } from "@/lib/platform/access";
import { listEvents, type EventView } from "@/lib/platform/events";
import { LEAD_RECORDS_COLLECTION } from "@/lib/lead-management/records";
import { countActiveProjects } from "@/lib/products/sprintos/projects";
import { TASKS_COLLECTION } from "@/lib/products/sprintos/tasks";
import { totalReceivables } from "@/lib/products/cashflow-ai/customers";
import { countActiveEmployees } from "@/lib/products/talentos/employees";
import { getPendingLeaveCount } from "@/lib/products/talentos/leave";
import { todayDateString } from "@/lib/products/talentos/time";

/**
 * "Your company today" on the Staff Hub: a handful of company-wide numbers,
 * each shown only to people who may see that area (`access.ts`) and each
 * failing soft — a number that can't be computed is left out, never an error.
 */

export interface CompanyKpi {
  key: "open_leads" | "active_projects" | "tasks_due" | "unpaid_invoices" | "employees" | "pending_leave";
  label: string;
  value: number;
  format?: "currency";
  href: string;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const KPI_DEFS: { key: CompanyKpi["key"]; label: string; area: Area; href: string; format?: "currency"; load: () => Promise<number> }[] = [
  { key: "open_leads", label: "Open leads", area: "leads", href: "/dealflow-ai/leads", load: async () => (await getDb()).collection(LEAD_RECORDS_COLLECTION).countDocuments({ status: "open", deletedAt: null }) },
  { key: "active_projects", label: "Active projects", area: "projects", href: "/sprintos/projects", load: countActiveProjects },
  {
    key: "tasks_due",
    label: "Tasks due this week",
    area: "tasks",
    href: "/sprintos/projects",
    load: async () => {
      const today = todayDateString();
      return (await getDb()).collection(TASKS_COLLECTION).countDocuments({ deletedAt: null, status: { $ne: "done" }, dueDate: { $gte: today, $lte: addDays(today, 6) } });
    },
  },
  { key: "unpaid_invoices", label: "Unpaid invoices", area: "invoices", href: "/cashflow-ai/invoices", format: "currency", load: totalReceivables },
  { key: "employees", label: "Employees", area: "employees", href: "/talentos/employees", load: countActiveEmployees },
  { key: "pending_leave", label: "Pending leave requests", area: "leave", href: "/talentos/leave?tab=requests", load: () => getPendingLeaveCount() },
];

export async function getCompanyKpis(user: Pick<AccessUser, "roles">): Promise<CompanyKpi[]> {
  const areas = await accessibleAreas(user);
  const defs = KPI_DEFS.filter((d) => areas.has(d.area));
  const settled = await Promise.allSettled(defs.map((d) => d.load()));
  const out: CompanyKpi[] = [];
  settled.forEach((r, i) => {
    const d = defs[i];
    if (r.status === "fulfilled" && Number.isFinite(r.value)) out.push({ key: d.key, label: d.label, value: r.value, format: d.format, href: d.href });
    else if (r.status === "rejected") console.error(`[dashboard] KPI ${d.key} failed`, r.reason);
  });
  return out;
}

/** The latest company events in the areas this person may see. */
export async function getRecentActivity(user: Pick<AccessUser, "roles">, limit = 10): Promise<EventView[]> {
  const areas = await accessibleAreas(user);
  if (areas.size === 0) return [];
  return (await listEvents({ areas: [...areas] }, { limit })).items;
}
