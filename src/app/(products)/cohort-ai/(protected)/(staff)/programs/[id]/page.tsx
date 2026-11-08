import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import {
  Clock,
  IndianRupee,
  FolderGit2,
  BadgeCheck,
  Briefcase,
  Layers,
} from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Link from "next/link";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { ProgramCategoryBadge, ProgramStatusBadge, TrainingModeBadge, BatchStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import ProgramActions from "@/components/products/cohort-ai/ProgramActions";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageProgramsBatches } from "@/lib/tms-roles";
import { getProgram, serializeProgram } from "@/lib/products/cohort-ai/programs";
import { listBatchesForProgram } from "@/lib/products/cohort-ai/batches";
import { getTmsSettings } from "@/lib/products/cohort-ai/settings";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [program, user, settings, batches] = await Promise.all([
    getProgram(id),
    getCurrentTmsUser(),
    getTmsSettings(),
    listBatchesForProgram(id),
  ]);
  if (!program) notFound();

  const canManage = user ? canManageProgramsBatches(user) : false;
  const p = serializeProgram(program);
  const totalEnrolled = batches.reduce((s, b) => s + b.enrolled, 0);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Programs", href: "/cohort-ai/programs" }, { label: p.name }]}
        title={<><span className="inline-flex flex-wrap items-center gap-2">{p.name}<ProgramStatusBadge status={p.status} /></span></>}
        description={<><span className="font-mono">{p.programCode}</span>
            {p.technology ? ` · ${p.technology}` : ""}</>}
        meta={<><div className="flex flex-wrap items-center gap-2 pt-1">
            <ProgramCategoryBadge category={p.category} />
            <TrainingModeBadge mode={p.mode} />
          </div></>}
        actions={<>{canManage && <ProgramActions program={p} technologySuggestions={settings.technologySuggestions} />}</>}
      />

      <KpiGrid>
        <KpiCard label="Duration" value={p.durationWeeks ?? 0} suffix=" wk" accent icon={<Clock className="size-4" />} />
        <KpiCard
          label="Fees"
          value={p.fees ?? 0}
          format="currency"
          icon={<IndianRupee className="size-4" />}
        />
        <KpiCard label="Batches" value={batches.length} icon={<Layers className="size-4" />} />
        <KpiCard label="Students Enrolled" value={totalEnrolled} icon={<FolderGit2 className="size-4" />} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="whitespace-pre-wrap text-muted-foreground">{p.description || "No description yet."}</p>
            <dl className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Currency</dt>
                <dd>{p.currency}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Fees</dt>
                <dd>{p.fees != null ? formatCurrency(p.fees, p.currency) : "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Certificate included</dt>
                <dd>{p.certificateIncluded ? <BadgeCheck className="size-4 text-green-600 dark:text-green-400" /> : "No"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Placement assistance</dt>
                <dd>{p.placementAssistance ? <Briefcase className="size-4 text-green-600 dark:text-green-400" /> : "No"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Last updated</dt>
                <dd>{formatDateTime(p.updatedAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Learning Outcomes</CardTitle></CardHeader>
          <CardContent>
            {p.learningOutcomes.length === 0 ? (
              <p className="text-sm text-muted-foreground">None listed.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {p.learningOutcomes.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            )}
            {p.tools.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.tools.map((t) => (
                  <span key={t} className="rounded-md bg-primary/8 px-2 py-0.5 text-xs font-medium text-primary">{t}</span>
                ))}
              </div>
            )}
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Batches ({batches.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {batches.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No batches for this program yet.{" "}
              {canManage ? (
                <Link href="/cohort-ai/batches" className="text-primary hover:underline">Schedule one</Link>
              ) : null}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b._id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{b.batchCode}</TableCell>
                    <TableCell>
                      <Link href={`/cohort-ai/batches/${b._id}`} className="font-medium hover:underline">{b.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.startDate ? formatDate(b.startDate) : "—"}</TableCell>
                    <TableCell className="tabular-nums">{b.enrolled}/{b.capacity}</TableCell>
                    <TableCell><BatchStatusBadge status={b.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        Enrolments and revenue for this program appear here as later Cohort AI phases land.
      </p>
    </div>
  );
}
