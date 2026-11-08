import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import HolidayManager from "@/components/products/talentos/HolidayManager";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageHolidays } from "@/lib/hrms-roles";
import { listHolidays, listHolidayYears, serializeHoliday } from "@/lib/products/talentos/holidays";

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await getCurrentHrmsUser();
  const canManage = !!user && canManageHolidays(user);

  const sp = await searchParams;
  const thisYear = new Date().getUTCFullYear();
  const activeYear = Number(sp.year) && Number(sp.year) > 2000 ? Number(sp.year) : thisYear;

  const [holidays, years] = await Promise.all([listHolidays(activeYear), listHolidayYears()]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Holidays" }]}
        title={<>Holiday Calendar</>}
        description={<>Company-wide holidays. Excluded from working-day counts in attendance and leave.</>}
      />

      <PanelListFilters>
<HolidayManager
        holidays={holidays.map(serializeHoliday).map((h) => ({ _id: h._id, date: h.date, name: h.name, type: h.type, states: h.states ?? [] }))}
        years={years}
        activeYear={activeYear}
        canManage={canManage}
      />
</PanelListFilters>
    </div>
  );
}
