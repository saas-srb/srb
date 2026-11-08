import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Plus, GraduationCap, Rocket, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import ProgramsDataTable from "@/components/products/cohort-ai/ProgramsDataTable";
import ProgramForm from "@/components/products/cohort-ai/ProgramForm";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageProgramsBatches } from "@/lib/tms-roles";
import { searchPrograms, countPrograms, serializeProgram } from "@/lib/products/cohort-ai/programs";
import { getTmsSettings } from "@/lib/products/cohort-ai/settings";
import {
  isValidProgramCategory,
  isValidProgramStatus,
  isValidTrainingMode,
  type ProgramCategory,
  type ProgramStatus,
  type TrainingMode,
} from "@/lib/products/cohort-ai/constants";

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentTmsUser();
  const canManage = user ? canManageProgramsBatches(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const category = sp.category && isValidProgramCategory(sp.category) ? (sp.category as ProgramCategory) : undefined;
  const status = sp.status && isValidProgramStatus(sp.status) ? (sp.status as ProgramStatus) : undefined;
  const mode = sp.mode && isValidTrainingMode(sp.mode) ? (sp.mode as TrainingMode) : undefined;
  const sortBy = (sp.sortBy as "createdAt" | "name" | "programCode" | "fees" | "status") || "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, settings, totalPrograms, activePrograms, industrial, internship] = await Promise.all([
    searchPrograms({ search: sp.search, category, status, mode, page, pageSize: 20, sortBy, sortDir }),
    getTmsSettings(),
    countPrograms(),
    countPrograms({ status: "active" }),
    countPrograms({ category: "industrial" }),
    countPrograms({ category: "internship" }),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Programs" }]}
        title={<>Programs</>}
        description={<>{totalPrograms} program{totalPrograms === 1 ? "" : "s"} in the catalogue.</>}
        actions={<>{canManage && (
          <ProgramForm
            technologySuggestions={settings.technologySuggestions}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Program
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total Programs" value={totalPrograms} accent icon={<GraduationCap className="size-4" />} />
        <KpiCard label="Active" value={activePrograms} icon={<Rocket className="size-4" />} />
        <KpiCard label="Industrial Training" value={industrial} icon={<GraduationCap className="size-4" />} />
        <KpiCard label="Internship" value={internship} icon={<Briefcase className="size-4" />} />
      </KpiGrid>

      <ProgramsDataTable
        items={result.items.map((p) => ({ ...serializeProgram(p), batchCount: p.batchCount }))}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        initial={{
          search: sp.search ?? "",
          category: sp.category ?? "",
          status: sp.status ?? "",
          mode: sp.mode ?? "",
          sortBy,
          sortDir,
        }}
      />

      {result.total === 0 && !sp.search && !sp.category && !sp.status && !sp.mode && (
        <p className="text-center text-sm text-muted-foreground">
          No programs yet.{" "}
          {canManage ? "Use “New Program” to add the first one." : "Ask a Cohort AI admin to add one."}
        </p>
      )}

      {!canManage && (
        <p className="text-xs text-muted-foreground">
          You have read-only access.{" "}
          <Link href="/cohort-ai" className="text-primary hover:underline">Back to dashboard</Link>
        </p>
      )}
    </div>
  );
}
