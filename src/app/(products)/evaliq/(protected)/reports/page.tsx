import PanelTabs from "@/components/platform/panel/PanelTabs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import ReportTable from "@/components/products/evaliq/ReportTable";
import { PageHeader, SectionCard } from "@/components/products/evaliq/OtsUi";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { buildReport, REPORT_TYPES, type ReportType } from "@/lib/products/evaliq/analytics";
import { getDirectory } from "@/lib/products/evaliq/people";
import { listTestOptions } from "@/lib/products/evaliq/tests";
import { listCategories } from "@/lib/products/evaliq/categories";
import { CANDIDATE_KINDS } from "@/lib/products/evaliq/constants";
import { cn } from "@/lib/utils";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "VIEW_REPORTS")) redirect("/evaliq");
  const sp = await searchParams;
  const type = (REPORT_TYPES.some((r) => r.value === sp.type) ? sp.type : "tests") as ReportType;
  const f = { from: sp.from, to: sp.to, testId: sp.testId, categoryId: sp.categoryId, kind: sp.kind, departmentId: sp.departmentId, designationId: sp.designationId };
  const [report, dir, tests, cats] = await Promise.all([buildReport(type, f), getDirectory(), listTestOptions(), listCategories("test")]);
  const qs = new URLSearchParams(Object.entries(f).filter((e): e is [string, string] => !!e[1])).toString();
  const tabHref = (t: string) => `/evaliq/reports?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter((e): e is [string, string] => !!e[1])), type: t })}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Test Reports"
        crumbs={[{ label: "Test Reports" }]}
        description="Performance by test, person, department, role, applicant, student, question and section; attempts, pass/fail, time and difficulty."
        actions={
          can(viewer, "EXPORT_REPORTS") && (
            <>
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/evaliq/export/report-${type}?format=csv${qs ? `&${qs}` : ""}`} />}>
                <Download className="size-3.5" /> CSV
              </Button>
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/evaliq/export/report-${type}?format=xlsx${qs ? `&${qs}` : ""}`} />}>
                <Download className="size-3.5" /> Excel
              </Button>
            </>
          )
        }
      />
      <PanelTabs label="Report type" active={type} tabs={REPORT_TYPES.map((r) => ({ key: r.value, label: r.label, href: tabHref(r.value) }))} />
      <SmmsFilterBar
        values={{ from: sp.from ?? "", to: sp.to ?? "", testId: sp.testId ?? "", categoryId: sp.categoryId ?? "", kind: sp.kind ?? "", departmentId: sp.departmentId ?? "", designationId: sp.designationId ?? "" }}
        fields={[
          { key: "from", label: "Assigned from", type: "date" },
          { key: "to", label: "Assigned to", type: "date" },
          { key: "testId", label: "Test", type: "select", options: tests },
          { key: "categoryId", label: "Test category", type: "select", options: cats.map((c) => ({ value: c._id, label: c.name })) },
          { key: "kind", label: "User type", type: "select", options: CANDIDATE_KINDS.map((k) => ({ value: k.value, label: k.label })) },
          { key: "departmentId", label: "Department", type: "select", options: dir.departments },
          { key: "designationId", label: "Role", type: "select", options: dir.designations },
        ]}
      />
      <SectionCard title={report.title} description={report.note}>
        <ReportTable report={report} />
      </SectionCard>
    </div>
  );
}
