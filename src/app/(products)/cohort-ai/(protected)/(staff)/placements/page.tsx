import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Briefcase, Target, TrendingUp, ExternalLink } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import PlacementForm from "@/components/products/cohort-ai/PlacementForm";
import PlacementRowActions from "@/components/products/cohort-ai/PlacementRowActions";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import { listPlacements, serializePlacement } from "@/lib/products/cohort-ai/placements";
import { listStudentOptions } from "@/lib/products/cohort-ai/students";
import { listProgramOptions } from "@/lib/products/cohort-ai/programs";
import { getDb } from "@/lib/mongodb";
import { formatDate } from "@/lib/utils";

export default async function PlacementsPage() {
  const user = await getCurrentTmsUser();
  if (!user || !canManageTraining(user)) redirect("/cohort-ai");

  const [rows, students, programs] = await Promise.all([
    listPlacements({}, 800),
    listStudentOptions(),
    listProgramOptions(),
  ]);

  const db = await getDb();
  const completed = await db.collection("student_enrollments").countDocuments({ deletedAt: null, status: "completed" });
  const rate = completed > 0 ? Math.round((rows.length / completed) * 100) : 0;
  const withPackage = rows.filter((r) => r.packageLpa != null);
  const avgPackage = withPackage.length
    ? Math.round((withPackage.reduce((s, r) => s + (r.packageLpa ?? 0), 0) / withPackage.length) * 10) / 10
    : 0;
  const programOptions = programs.map((p) => ({ _id: p._id, name: p.name }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Placements" }]}
        title={<>Placements</>}
        description={<>{rows.length} placement{rows.length === 1 ? "" : "s"} recorded.</>}
        actions={<><PlacementForm
          students={students}
          programs={programOptions}
          trigger={
            <Button type="button" size="sm">
              <Plus className="size-3.5" data-icon="inline-start" />
              Record Placement
            </Button>
          }
        /></>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Total Placements" value={rows.length} accent icon={<Briefcase className="size-4" />} />
        <KpiCard label="Placement Rate" value={rate} suffix="%" icon={<Target className="size-4" />} />
        <KpiCard label="Avg Package (LPA)" value={avgPackage} icon={<TrendingUp className="size-4" />} />
        <KpiCard label="Completed Enrolments" value={completed} icon={<Target className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No placements yet. Use “Record Placement”.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Company / Role</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Placed on</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell>
                      <Link href={`/cohort-ai/students/${r.studentId}`} className="font-medium hover:underline">{r.studentName}</Link>
                      {r.studentCode && <div className="font-mono text-xs text-muted-foreground">{r.studentCode}</div>}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{r.company}</span>
                      <div className="text-xs text-muted-foreground">{r.role}{r.location ? ` · ${r.location}` : ""}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">{r.packageLpa != null ? `${r.packageLpa} LPA` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.typeLabel}
                      {r.offerLetterUrl && (
                        <a href={r.offerLetterUrl} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex text-primary">
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.placedOn)}</TableCell>
                    <TableCell>
                      <PlacementRowActions record={serializePlacement(r)} students={students} programs={programOptions} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
