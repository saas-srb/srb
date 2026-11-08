import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Plus, Layers, Rocket, CalendarDays, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import BatchesDataTable from "@/components/products/cohort-ai/BatchesDataTable";
import BatchForm from "@/components/products/cohort-ai/BatchForm";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageProgramsBatches } from "@/lib/tms-roles";
import { searchBatches, countBatches, serializeBatch } from "@/lib/products/cohort-ai/batches";
import { listProgramOptions } from "@/lib/products/cohort-ai/programs";
import { listMentorOptions, resolveMentorNames } from "@/lib/products/cohort-ai/mentors";
import {
  isValidBatchStatus,
  isValidTrainingMode,
  type BatchStatus,
  type TrainingMode,
} from "@/lib/products/cohort-ai/constants";

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentTmsUser();
  const canManage = user ? canManageProgramsBatches(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidBatchStatus(sp.status) ? (sp.status as BatchStatus) : undefined;
  const mode = sp.mode && isValidTrainingMode(sp.mode) ? (sp.mode as TrainingMode) : undefined;
  const sortBy = (sp.sortBy as "createdAt" | "name" | "batchCode" | "startDate" | "status") || "startDate";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, programs, mentors, totalBatches, runningBatches] = await Promise.all([
    searchBatches({
      search: sp.search,
      programId: sp.programId,
      mentorId: sp.mentorId,
      status,
      mode,
      page,
      pageSize: 20,
      sortBy,
      sortDir,
    }),
    listProgramOptions(),
    listMentorOptions(),
    countBatches(),
    countBatches({ status: "running" }),
  ]);

  const totalSeats = result.items.reduce((s, b) => s + b.capacity, 0);
  const filledSeats = result.items.reduce((s, b) => s + b.enrolled, 0);

  const mentorNames = await resolveMentorNames(result.items.map((b) => b.mentorId ?? "").filter(Boolean));
  const programOptions = programs.map((p) => ({ _id: p._id, name: p.name }));
  const mentorOptions = mentors.map((m) => ({ _id: m._id, name: m.name }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Batches" }]}
        title={<>Batches</>}
        description={<>{totalBatches} batch{totalBatches === 1 ? "" : "es"} across all programs.</>}
        actions={<><div className="flex items-center gap-2">
          <Link href="/cohort-ai/batches/calendar" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <CalendarDays className="size-3.5" data-icon="inline-start" />
            Calendar
          </Link>
          {canManage && (
            <BatchForm
              programs={programOptions}
              mentors={mentorOptions}
              trigger={
                <Button type="button" size="sm">
                  <Plus className="size-3.5" data-icon="inline-start" />
                  New Batch
                </Button>
              }
            />
          )}
        </div></>}
      />

      <KpiGrid>
        <KpiCard label="Total Batches" value={totalBatches} accent icon={<Layers className="size-4" />} />
        <KpiCard label="Running" value={runningBatches} icon={<Rocket className="size-4" />} />
        <KpiCard label="Seats (this page)" value={totalSeats} icon={<Users className="size-4" />} />
        <KpiCard
          label="Occupancy (this page)"
          value={totalSeats > 0 ? Math.round((filledSeats / totalSeats) * 100) : 0}
          suffix="%"
          icon={<Users className="size-4" />}
        />
      </KpiGrid>

      <BatchesDataTable
        items={result.items.map((b) => ({
          ...serializeBatch(b),
          programName: b.programName,
          enrolled: b.enrolled,
          availableSeats: b.availableSeats,
          mentorName: b.mentorId ? mentorNames.get(b.mentorId) ?? null : null,
        }))}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        programs={programOptions}
        mentors={mentorOptions}
        initial={{
          search: sp.search ?? "",
          programId: sp.programId ?? "",
          mentorId: sp.mentorId ?? "",
          status: sp.status ?? "",
          mode: sp.mode ?? "",
          sortBy,
          sortDir,
        }}
      />

      {result.total === 0 && !sp.search && !sp.programId && !sp.status && !sp.mode && (
        <p className="text-center text-sm text-muted-foreground">
          No batches yet.{" "}
          {canManage
            ? programOptions.length > 0
              ? "Use “New Batch” to schedule the first one."
              : "Create a program first, then add a batch."
            : "Ask a training manager to schedule one."}
        </p>
      )}
    </div>
  );
}
