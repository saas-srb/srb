import "server-only";
import { getLearnerSchedule, type LearnerOverview } from "@/lib/products/clientos/student";
import { listProgramOptions } from "@/lib/products/cohort-ai/programs";
import { ATTENDANCE_STATUSES } from "@/lib/products/cohort-ai/constants";
import type { CurrentPortalUser } from "@/lib/portal-auth";
import type { PortalLeadView } from "@/lib/products/clientos/lead";
import { accessFor, buildWalletPart, buildNotifications, leadFeed, journeyBlock, mergeFeed, unreadAction, filterActions } from "@/lib/products/clientos/dashboard/common";
import type { ActionItem, ChartDef, DashboardModel, EventItem, FeedItem, Insight, Kpi, QuickAction, Recommendation, TableDef } from "@/lib/products/clientos/dashboard/types";

const today = () => new Date().toISOString().slice(0, 10);
const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

export async function buildStudentDashboard(user: CurrentPortalUser, data: LearnerOverview | null, leadView: PortalLeadView | null): Promise<DashboardModel> {
  const { can } = accessFor(user.role);
  const [walletPart, notif, schedule, programs] = await Promise.all([
    buildWalletPart(user),
    buildNotifications(user),
    getLearnerSchedule(data?.batchIds ?? []).catch(() => ({ upcoming: [], past: [] })),
    listProgramOptions().catch(() => []),
  ]);
  const overview = data?.overview ?? { enrollments: [], averageProgress: 0 };
  const attendance = data?.attendance ?? { total: 0, attended: 0, ratePercent: 0, byStatus: {} };
  const certificates = data?.certificates ?? [];
  const payments = data?.payments ?? [];
  const projects = data?.projects ?? [];
  const assignments = data?.assignments ?? [];
  const enrollments = overview.enrollments;
  const active = enrollments.filter((e) => e.status === "active");
  const completed = enrollments.filter((e) => e.status === "completed");

  const paid = payments.reduce((s, p) => s + p.paidAmount, 0);
  const pendingFees = payments.reduce((s, p) => s + p.pendingAmount, 0);
  const net = payments.reduce((s, p) => s + Math.max(p.totalFees - p.discount, 0), 0);

  const graded = assignments.filter((a) => a.submission?.marks != null && a.maxMarks > 0);
  const avgScore = graded.length ? Math.round(graded.reduce((s, a) => s + ((a.submission!.marks as number) / a.maxMarks) * 100, 0) / graded.length) : null;
  const dueList = assignments.filter((a) => !a.submission || a.submission.status === "pending" || a.submission.status === "resubmit");
  const submitted = assignments.filter((a) => a.submission && (a.submission.status === "submitted" || a.submission.status === "reviewed"));

  const w = walletPart.wallet;
  const kpis: Kpi[] = [
    { id: "progress", label: "Learning progress", value: overview.averageProgress, format: "percent", icon: "trending", href: "/clientos/program", hint: `${active.length} active · ${completed.length} completed` },
    { id: "attendance", label: "Attendance", value: attendance.ratePercent, format: "percent", icon: "calendar", href: "/clientos/attendance", tone: attendance.total > 0 && attendance.ratePercent < 75 ? "warn" : "good", hint: `${attendance.attended}/${attendance.total} classes` },
    { id: "score", label: "Average score", value: avgScore ?? "—", format: avgScore == null ? "text" : "percent", icon: "target", href: "/clientos/assignments", hint: `${graded.length} graded assessment${graded.length === 1 ? "" : "s"}` },
    { id: "due", label: "Assignments due", value: dueList.length, format: "number", icon: "clipboard", href: "/clientos/assignments", tone: dueList.length > 0 ? "warn" : "good" },
    { id: "certs", label: "Certificates", value: certificates.length, format: "number", icon: "award", href: "/clientos/certificates" },
    { id: "fees", label: "Fees outstanding", value: pendingFees, format: "currency", icon: "receipt", href: "/clientos/payments", tone: pendingFees > 0 ? "warn" : "good", hint: net > 0 ? `${Math.round((paid / net) * 100)}% paid` : undefined },
    { id: "credits", label: "Credits available", value: w.available, format: "credits", icon: "coins", href: "/clientos/wallet", hint: w.expiringSoon > 0 ? `${w.expiringSoon} expiring soon` : undefined, delta: walletPart.earnedTotals.previous > 0 ? { pct: Math.round(((walletPart.earnedTotals.current - walletPart.earnedTotals.previous) / walletPart.earnedTotals.previous) * 100), label: "earned vs prev 30d" } : undefined },
    { id: "referral", label: "Referral earnings", value: w.referral.credits, format: "credits", icon: "gift", href: "/clientos/referrals", hint: `${w.referral.rewarded} rewarded · ${w.referral.pending} pending` },
  ];

  // Learning activity: classes held + assignments submitted, per day.
  const activity = new Map<string, { classes: number; submissions: number }>();
  const bump = (d: string | null | undefined, key: "classes" | "submissions") => {
    if (!d) return;
    const k = d.slice(0, 10);
    const row = activity.get(k) ?? { classes: 0, submissions: 0 };
    row[key] += 1;
    activity.set(k, row);
  };
  for (const c of schedule.past) if (c.status === "completed") bump(c.date, "classes");
  for (const a of assignments) bump(a.submission?.submittedAt, "submissions");

  const statusLabel = new Map(ATTENDANCE_STATUSES.map((s) => [s.value as string, s.label]));
  const charts: ChartDef[] = [
    {
      id: "activity",
      title: "Learning activity",
      subtitle: "Classes held and assignments submitted",
      section: "performance",
      kind: "area",
      href: "/clientos/schedule",
      series: [
        { key: "classes", label: "Classes", color: "blue" },
        { key: "submissions", label: "Submissions", color: "primary" },
      ],
      rows: [...activity.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
      emptyText: "No learning activity in this range.",
    },
    {
      id: "attendance",
      title: "Attendance breakdown",
      section: "performance",
      kind: "donut",
      href: "/clientos/attendance",
      categories: Object.entries(attendance.byStatus).map(([k, v]) => ({ name: statusLabel.get(k) ?? k, value: v, href: "/clientos/attendance" })),
      emptyText: "No attendance recorded yet.",
    },
    {
      id: "results",
      title: "Assessment results",
      subtitle: "Score % per graded assignment",
      section: "performance",
      kind: "hbar",
      href: "/clientos/assignments",
      format: "percent",
      categories: graded.slice(-8).map((a) => ({ name: a.title.slice(0, 22), value: Math.round(((a.submission!.marks as number) / a.maxMarks) * 100), href: "/clientos/assignments" })),
      emptyText: "No graded assessments yet.",
    },
    {
      id: "progress",
      title: "Program progress",
      section: "overview",
      kind: "hbar",
      href: "/clientos/program",
      format: "percent",
      categories: enrollments.map((e) => ({ name: e.programName.slice(0, 24), value: e.progressPercent, href: "/clientos/program" })),
      emptyText: "No enrolments yet.",
    },
    {
      id: "fees",
      title: "Fees: paid vs outstanding",
      section: "money",
      kind: "donut",
      href: "/clientos/payments",
      format: "currency",
      categories: [
        { name: "Paid", value: paid, href: "/clientos/payments" },
        { name: "Outstanding", value: pendingFees, href: "/clientos/payments" },
      ].filter((c) => c.value > 0),
      emptyText: "No fee plan on record.",
    },
    ...walletPart.charts,
  ];

  const tables: TableDef[] = [
    {
      id: "assignments",
      title: "Assignments & results",
      href: "/clientos/assignments",
      exportName: "assignments",
      dateKey: "due",
      columns: [
        { key: "title", label: "Assignment" },
        { key: "program", label: "Program" },
        { key: "due", label: "Due", type: "date" },
        { key: "status", label: "Status", type: "badge" },
        { key: "score", label: "Score", type: "number", align: "right" },
      ],
      rows: assignments.map((a) => ({
        cells: {
          title: a.title,
          program: a.programName,
          due: a.dueDate ? `${a.dueDate}T00:00:00.000Z` : null,
          status: a.submission?.status ?? "pending",
          score: a.submission?.marks != null ? `${a.submission.marks}/${a.maxMarks}` : null,
        },
        href: "/clientos/assignments",
      })),
      emptyText: "No assignments yet.",
    },
    {
      id: "classes",
      title: "Classes",
      href: "/clientos/schedule",
      exportName: "classes",
      dateKey: "date",
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "time", label: "Time" },
        { key: "topic", label: "Topic" },
        { key: "mentor", label: "Mentor" },
        { key: "status", label: "Status", type: "badge" },
      ],
      rows: [...schedule.upcoming, ...schedule.past].slice(0, 80).map((c) => ({
        cells: { date: `${c.date}T00:00:00.000Z`, time: c.startTime, topic: c.topic, mentor: c.mentorName, status: c.status },
        href: "/clientos/schedule",
      })),
      emptyText: "No classes scheduled.",
    },
    {
      id: "enrollments",
      title: "Enrolments",
      href: "/clientos/program",
      exportName: "enrolments",
      columns: [
        { key: "program", label: "Program" },
        { key: "batch", label: "Batch" },
        { key: "mentor", label: "Mentor" },
        { key: "progress", label: "Progress %", type: "number", align: "right" },
        { key: "status", label: "Status", type: "badge" },
      ],
      rows: enrollments.map((e) => ({ cells: { program: e.programName, batch: e.batchName, mentor: e.mentorName, progress: e.progressPercent, status: e.status }, href: "/clientos/program" })),
      emptyText: "No enrolments yet.",
    },
    {
      id: "certificates",
      title: "Certificates",
      href: "/clientos/certificates",
      exportName: "certificates",
      dateKey: "issued",
      columns: [
        { key: "number", label: "Certificate" },
        { key: "title", label: "Program / project" },
        { key: "issued", label: "Issued", type: "date" },
        { key: "grade", label: "Grade" },
      ],
      rows: certificates.map((c) => ({ cells: { number: c.certificateNumber, title: c.title ?? c.programName, issued: `${c.issuedOn}T00:00:00.000Z`, grade: c.grade }, href: "/clientos/certificates" })),
      emptyText: "No certificates issued yet.",
    },
    {
      id: "fee-plans",
      title: "Fee plans",
      href: "/clientos/payments",
      exportName: "fee-plans",
      columns: [
        { key: "program", label: "Program" },
        { key: "net", label: "Net fees", type: "currency", align: "right" },
        { key: "paid", label: "Paid", type: "currency", align: "right" },
        { key: "pending", label: "Outstanding", type: "currency", align: "right" },
        { key: "status", label: "Status", type: "badge" },
      ],
      rows: payments.map((p) => ({ cells: { program: p.programName, net: Math.max(p.totalFees - p.discount, 0), paid: p.paidAmount, pending: p.pendingAmount, status: p.status }, href: "/clientos/payments" })),
      emptyText: "No fee plan on record.",
    },
    ...walletPart.tables,
  ];

  const pending: ActionItem[] = [];
  for (const a of dueList.slice(0, 6)) {
    const overdue = a.dueDate ? a.dueDate < today() : false;
    pending.push({ id: `as-${a._id}`, title: a.submission?.status === "resubmit" ? `Rework: ${a.title}` : `Submit: ${a.title}`, detail: a.dueDate ? (overdue ? "Overdue" : `Due in ${Math.max(daysUntil(a.dueDate), 0)} day(s)`) : undefined, href: "/clientos/assignments", priority: overdue || a.submission?.status === "resubmit" ? "high" : "medium", due: a.dueDate ?? undefined });
  }
  if (pendingFees > 0) pending.push({ id: "fees", title: `Fees outstanding`, detail: `₹${Math.round(pendingFees).toLocaleString("en-IN")} — you can apply credits`, href: "/clientos/payments", priority: "medium" });
  if (attendance.total > 0 && attendance.ratePercent < 75) pending.push({ id: "attendance", title: "Attendance is below 75%", detail: "Catch up to stay eligible for certification.", href: "/clientos/attendance", priority: "high" });
  pending.push(...unreadAction(notif.unread));

  const upcoming: EventItem[] = [
    ...schedule.upcoming.slice(0, 6).map((c) => ({ id: `cl-${c._id}`, title: c.topic, detail: `${c.batchName}${c.startTime ? ` · ${c.startTime}` : ""}`, at: `${c.date}T${c.startTime ?? "09:00"}:00`, href: "/clientos/schedule", kind: "class" as const })),
    ...dueList.filter((a) => a.dueDate && a.dueDate >= today()).slice(0, 6).map((a) => ({ id: `du-${a._id}`, title: `Due: ${a.title}`, at: `${a.dueDate}T23:59:00`, href: "/clientos/assignments", kind: "deadline" as const })),
  ].sort((a, b) => a.at.localeCompare(b.at)).slice(0, 8);

  const completedFeed: FeedItem[] = [
    ...submitted.slice(0, 5).map((a) => ({ id: `ok-${a._id}`, kind: "system" as const, title: `${a.submission!.status === "reviewed" ? "Reviewed" : "Submitted"}: ${a.title}`, detail: a.submission!.marks != null ? `Scored ${a.submission!.marks}/${a.maxMarks}` : null, at: a.submission!.reviewedAt ?? a.submission!.submittedAt ?? a.createdAt, href: "/clientos/assignments" })),
    ...certificates.slice(0, 3).map((c) => ({ id: `ce-${c._id}`, kind: "system" as const, title: `Certificate issued: ${c.title ?? c.programName}`, at: `${c.issuedOn}T00:00:00.000Z`, href: "/clientos/certificates" })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  const insights: Insight[] = [...walletPart.insights];
  if (attendance.total > 0) insights.push(attendance.ratePercent >= 90 ? { id: "att-good", type: "good", title: `Excellent attendance — ${attendance.ratePercent}%`, body: "Keep it up; consistent attendance strongly predicts outcomes.", href: "/clientos/attendance" } : attendance.ratePercent < 75 ? { id: "att-low", type: "attention", title: `Attendance ${attendance.ratePercent}% is below target`, body: "Most programs require 75% for certification.", href: "/clientos/attendance" } : { id: "att-ok", type: "changed", title: `Attendance is ${attendance.ratePercent}%`, body: "A few more classes will lift you above 90%.", href: "/clientos/attendance" });
  if (avgScore != null) insights.push({ id: "score", type: avgScore >= 75 ? "good" : "changed", title: `Average assessment score ${avgScore}%`, body: avgScore >= 75 ? "You're performing strongly." : "Review feedback on lower-scoring work.", href: "/clientos/assignments" });
  const soon = dueList.filter((a) => a.dueDate && daysUntil(a.dueDate) >= 0 && daysUntil(a.dueDate) <= 3);
  if (soon.length) insights.push({ id: "soon", type: "attention", title: `${soon.length} assignment${soon.length === 1 ? "" : "s"} due within 3 days`, body: soon.map((a) => a.title).join(", "), href: "/clientos/assignments" });
  if (projects.length) insights.push({ id: "proj", type: "good", title: `${projects.length} live project${projects.length === 1 ? "" : "s"}`, body: `Average progress ${Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)}%.`, href: "/clientos/projects" });

  const enrolledIds = new Set(enrollments.map((e) => e.programId));
  const recs: Recommendation[] = programs
    .filter((p) => !enrolledIds.has(p._id))
    .slice(0, 3)
    .map((p) => ({ id: `prog-${p._id}`, title: p.name, body: p.category === "internship" ? "Internship program you can add to your profile." : "Industrial training program to widen your skills.", href: p.category === "internship" ? "/internship-program" : "/industrial-training", cta: "Explore" }));

  const quick: QuickAction[] = filterActions(
    [
      { id: "q-assign", label: "Submit assignment", href: "/clientos/assignments", icon: "clipboard" },
      { id: "q-sched", label: "View schedule", href: "/clientos/schedule", icon: "calendar" },
      { id: "q-pay", label: "Pay / use credits", href: "/clientos/payments", icon: "receipt" },
      { id: "q-cert", label: "Certificates", href: "/clientos/certificates", icon: "award" },
      { id: "q-refer", label: "Refer & earn", href: "/clientos/referrals", icon: "gift" },
      { id: "q-offers", label: "Browse offers", href: "/offers", icon: "sparkles" },
    ],
    can
  );

  const primary = enrollments.find((e) => e.status === "active") ?? enrollments[0];
  return {
    kind: "student",
    title: "Student dashboard",
    subtitle: primary ? `${primary.programName} · ${primary.batchName}` : "Your learning overview",
    badge: user.role === "intern" ? "Intern" : "Trainee",
    kpis,
    charts,
    tables,
    timeline: mergeFeed(leadFeed(leadView), walletPart.feed),
    pending,
    completed: completedFeed,
    upcoming,
    insights,
    recommendations: [...recs, ...walletPart.recommendations],
    quickActions: quick,
    notifications: notif.items,
    unreadCount: notif.unread,
    wallet: walletPart.wallet,
    journey: journeyBlock(leadView),
    notice: data ? undefined : "Your enrolment appears here once our team places you in a batch. Meanwhile your wallet, notifications, journey and recommendations are live below.",
  };
}
