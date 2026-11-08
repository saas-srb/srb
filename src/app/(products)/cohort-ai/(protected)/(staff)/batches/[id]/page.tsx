import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Users, CalendarDays, UserRound, Armchair } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { BatchStatusBadge, TrainingModeBadge, StudentStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import BatchActions from "@/components/products/cohort-ai/BatchActions";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageProgramsBatches } from "@/lib/tms-roles";
import { getBatch, serializeBatch, enrolledCount, getBatchRoster } from "@/lib/products/cohort-ai/batches";
import { getProgram, listProgramOptions } from "@/lib/products/cohort-ai/programs";
import { getMentorName, listMentorOptions } from "@/lib/products/cohort-ai/mentors";
import { listClassesForBatch, batchAttendanceSummary } from "@/lib/products/cohort-ai/classes";
import { ClassStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await getBatch(id);
  if (!batch) notFound();

  const [user, program, mentorName, enrolled, roster, programs, mentors, classes, attendance] = await Promise.all([
    getCurrentTmsUser(),
    getProgram(batch.programId),
    getMentorName(batch.mentorId),
    enrolledCount(id),
    getBatchRoster(id),
    listProgramOptions(),
    listMentorOptions(),
    listClassesForBatch(id),
    batchAttendanceSummary(id),
  ]);

  const canManage = user ? canManageProgramsBatches(user) : false;
  const b = serializeBatch(batch);
  const available = Math.max(b.capacity - enrolled, 0);
  const occupancy = b.capacity > 0 ? Math.round((enrolled / b.capacity) * 100) : 0;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Batches", href: "/cohort-ai/batches" }, { label: b.name }]}
        title={<><span className="inline-flex flex-wrap items-center gap-2">{b.name}<BatchStatusBadge status={b.status} /></span></>}
        description={<><span className="font-mono">{b.batchCode}</span>
            {program ? (
              <>
                {" · "}
                <Link href={`/cohort-ai/programs/${program._id}`} className="text-primary hover:underline">{program.name}</Link>
              </>
            ) : null}</>}
        meta={<><div className="pt-1"><TrainingModeBadge mode={b.mode} /></div></>}
        actions={<>{canManage && (
          <BatchActions
            batch={b}
            programs={programs.map((p) => ({ _id: p._id, name: p.name }))}
            mentors={mentors.map((m) => ({ _id: m._id, name: m.name }))}
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Enrolled" value={enrolled} accent icon={<Users className="size-4" />} />
        <KpiCard label="Capacity" value={b.capacity} icon={<Armchair className="size-4" />} />
        <KpiCard label="Seats Available" value={available} tone={available === 0 ? "down" : undefined} icon={<Armchair className="size-4" />} />
        <KpiCard label="Occupancy" value={occupancy} suffix="%" icon={<Users className="size-4" />} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
              <span>
                {b.startDate ? formatDate(b.startDate) : "Start TBD"}
                {" – "}
                {b.endDate ? formatDate(b.endDate) : "End TBD"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
              <span>{b.timing || "Timing not set"}</span>
            </div>
            <div className="flex items-center gap-2">
              <UserRound className="size-4 shrink-0 text-muted-foreground" />
              <span>{mentorName ?? "Mentor unassigned"}</span>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Occupancy</p>
              <ProgressBar value={occupancy} />
            </div>
            <p className="text-xs text-muted-foreground">Last updated {formatDateTime(b.updatedAt)}</p>
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{b.notes || "No notes."}</p>
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard interactive={false}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Classes ({classes.length})</CardTitle>
          <span className="text-xs text-muted-foreground">
            Attendance rate: <span className="font-semibold text-foreground">{attendance.ratePercent}%</span>
            {attendance.total > 0 ? ` (${attendance.attended}/${attendance.total} marks)` : ""}
          </span>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {classes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No classes scheduled for this batch.{" "}
              {canManage ? <Link href="/cohort-ai/classes" className="text-primary hover:underline">Schedule one</Link> : null}
            </p>
          ) : (
            classes.slice(0, 12).map((c) => (
              <Link
                key={c._id}
                href={`/cohort-ai/classes/${c._id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <span className="font-medium">{c.topic}</span>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(c.date)}{c.startTime ? ` · ${c.startTime}` : ""} · {c.attendanceMarked}/{c.rosterSize} marked
                  </p>
                </div>
                <ClassStatusBadge status={c.status} />
              </Link>
            ))
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Roster ({roster.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {roster.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No students enrolled yet. Enrolment lands with the student CRM in Phase 4.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enrolled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((r) => (
                  <TableRow key={r.enrollmentId}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.studentCode ?? "—"}</TableCell>
                    <TableCell>
                      <Link href={`/cohort-ai/students/${r.studentId}`} className="font-medium hover:underline">{r.fullName}</Link>
                      {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
                    </TableCell>
                    <TableCell className="w-40"><ProgressBar value={r.progressPercent} /></TableCell>
                    <TableCell><StudentStatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{r.enrolledOn ? formatDate(r.enrolledOn) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
