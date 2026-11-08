import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Clock, Video, UserRound, FileText, Film } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { ClassStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import ClassActions from "@/components/products/cohort-ai/ClassActions";
import AttendanceMarker from "@/components/products/cohort-ai/AttendanceMarker";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import { getClass, serializeClass, getClassAttendance } from "@/lib/products/cohort-ai/classes";
import { getBatch } from "@/lib/products/cohort-ai/batches";
import { getProgram } from "@/lib/products/cohort-ai/programs";
import { getMentorName } from "@/lib/products/cohort-ai/mentors";
import { listBatchPickerOptions } from "@/lib/products/cohort-ai/batches";
import { listMentorOptions } from "@/lib/products/cohort-ai/mentors";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cls = await getClass(id);
  if (!cls) notFound();

  const [user, batch, program, mentorName, roster, batches, mentors] = await Promise.all([
    getCurrentTmsUser(),
    getBatch(cls.batchId),
    getProgram(cls.programId),
    getMentorName(cls.mentorId),
    getClassAttendance(id, cls.batchId),
    listBatchPickerOptions(),
    listMentorOptions(),
  ]);

  const canManage = user ? canManageTraining(user) : false;
  const c = serializeClass(cls);
  const marked = roster.filter((r) => r.status).length;
  const present = roster.filter((r) => r.status === "present" || r.status === "late" || r.status === "excused").length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Classes", href: "/cohort-ai/classes" }, { label: c.topic }]}
        title={<><span className="inline-flex flex-wrap items-center gap-2">{c.topic}<ClassStatusBadge status={c.status} /></span></>}
        description={<>{batch ? (
              <Link href={`/cohort-ai/batches/${batch._id}`} className="text-primary hover:underline">{batch.name}</Link>
            ) : "Unknown batch"}
            {program ? ` · ${program.name}` : ""}</>}
        actions={<>{canManage && (
          <ClassActions
            classItem={c}
            batches={batches.map((b) => ({ _id: b._id, name: b.name, programName: b.programName }))}
            mentors={mentors.map((m) => ({ _id: m._id, name: m.name }))}
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Roster" value={roster.length} accent icon={<UserRound className="size-4" />} />
        <KpiCard label="Attendance Marked" value={marked} icon={<CalendarDays className="size-4" />} />
        <KpiCard label="Attended" value={present} icon={<UserRound className="size-4" />} />
        <KpiCard
          label="Attendance Rate"
          value={marked > 0 ? Math.round((present / marked) * 100) : 0}
          suffix="%"
          icon={<CalendarDays className="size-4" />}
        />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
              <span>{formatDate(c.date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-muted-foreground" />
              <span>{c.startTime ?? "Time TBD"} · {c.durationMinutes} minutes</span>
            </div>
            <div className="flex items-center gap-2">
              <UserRound className="size-4 shrink-0 text-muted-foreground" />
              <span>{mentorName ?? "Mentor unassigned"}</span>
            </div>
            {c.meetingLink && (
              <div className="flex items-center gap-2">
                <Video className="size-4 shrink-0 text-muted-foreground" />
                <a href={c.meetingLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">Join meeting</a>
              </div>
            )}
            {c.recordingUrl && (
              <div className="flex items-center gap-2">
                <Film className="size-4 shrink-0 text-muted-foreground" />
                <a href={c.recordingUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Watch recording</a>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Last updated {formatDateTime(c.updatedAt)}</p>
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle className="flex items-center gap-1.5"><FileText className="size-4" /> Notes</CardTitle></CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{c.notes || "No notes."}</p>
          </CardContent>
        </GlassCard>
      </div>

      <AttendanceMarker classId={c._id} roster={roster} canEdit={canManage} />
    </div>
  );
}
