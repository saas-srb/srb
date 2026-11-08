import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, CalendarDays, CheckCircle2, Video, Users } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import ClassScheduleView from "@/components/products/cohort-ai/ClassScheduleView";
import ClassForm from "@/components/products/cohort-ai/ClassForm";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import { listClasses, countClasses } from "@/lib/products/cohort-ai/classes";
import { listBatchPickerOptions } from "@/lib/products/cohort-ai/batches";
import { listMentorOptions } from "@/lib/products/cohort-ai/mentors";
import { getTmsSettings } from "@/lib/products/cohort-ai/settings";

export default async function ClassesPage() {
  const user = await getCurrentTmsUser();
  const canManage = user ? canManageTraining(user) : false;

  const [classes, batches, mentors, settings, total, upcoming, completed] = await Promise.all([
    listClasses({}, 800),
    listBatchPickerOptions(),
    listMentorOptions(),
    getTmsSettings(),
    countClasses(),
    countClasses({ from: new Date().toISOString().slice(0, 10), status: "scheduled" }),
    countClasses({ status: "completed" }),
  ]);

  const withLinks = classes.filter((c) => c.meetingLink).length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Classes" }]}
        title={<>Classes &amp; Schedule</>}
        description={<>{total} class{total === 1 ? "" : "es"} scheduled across all batches.</>}
        actions={<>{canManage && (
          <ClassForm
            batches={batches.map((b) => ({ _id: b._id, name: b.name, programName: b.programName }))}
            mentors={mentors.map((m) => ({ _id: m._id, name: m.name }))}
            defaultDuration={settings.defaultClassDurationMinutes}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                Schedule Class
              </Button>
            }
          />
        )}</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Total Classes" value={total} accent icon={<CalendarDays className="size-4" />} />
        <KpiCard label="Upcoming" value={upcoming} icon={<CalendarDays className="size-4" />} />
        <KpiCard label="Completed" value={completed} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="With Meeting Link" value={withLinks} icon={<Video className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="py-5">
          {classes.length === 0 ? (
            <p className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Users className="size-6" />
              No classes scheduled yet.{" "}
              {canManage
                ? batches.length > 0
                  ? "Use “Schedule Class”."
                  : "Create a batch first."
                : "Your mentors will schedule classes here."}
            </p>
          ) : (
            <ClassScheduleView
              classes={classes.map((c) => ({
                _id: c._id,
                topic: c.topic,
                batchName: c.batchName,
                batchCode: c.batchCode,
                programName: c.programName,
                mentorName: c.mentorName,
                date: c.date,
                startTime: c.startTime,
                durationMinutes: c.durationMinutes,
                meetingLink: c.meetingLink,
                status: c.status,
              }))}
            />
          )}
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
