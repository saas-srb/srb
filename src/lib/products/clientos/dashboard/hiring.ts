import "server-only";
import type { ApplicantOverview } from "@/lib/products/clientos/applicant";
import { getOpenJobPositions } from "@/lib/career-applications";
import { listLeadsForUser } from "@/lib/lead-management/records";
import { stageMeta } from "@/lib/lead-management/workflows";
import type { CurrentPortalUser } from "@/lib/portal-auth";
import type { PortalLeadView } from "@/lib/products/clientos/lead";
import { accessFor, buildWalletPart, buildNotifications, leadFeed, journeyBlock, mergeFeed, unreadAction, filterActions } from "@/lib/products/clientos/dashboard/common";
import type { ActionItem, ChartDef, DashboardModel, EventItem, FeedItem, Insight, Kpi, QuickAction, Recommendation, TableDef } from "@/lib/products/clientos/dashboard/types";

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Hiring dashboard — the candidate side of recruitment: application pipeline,
 * interview schedule, offer, document readiness and open positions. (Employer-side
 * recruiting tools live in the HRMS product, not here.)
 */
export async function buildHiringDashboard(user: CurrentPortalUser, data: ApplicantOverview | null, leadView: PortalLeadView | null): Promise<DashboardModel> {
  const { can } = accessFor(user.role);
  const [walletPart, notif, leads, openRoles] = await Promise.all([
    buildWalletPart(user),
    buildNotifications(user),
    listLeadsForUser(user.id).catch(() => []),
    getOpenJobPositions().catch(() => []),
  ]);
  const applications = leads.filter((l) => l.type === "job_applicant");
  const interviews = data?.interviews ?? [];
  const upcomingIv = data?.upcomingInterviews ?? [];
  const docs = data?.requiredDocuments ?? [];
  const docsDone = docs.filter((d) => d.provided).length;
  const stepsDone = data?.timeline.filter((s) => s.state === "done").length ?? 0;
  const stepsTotal = data?.timeline.length ?? 0;
  const pipelinePct = stepsTotal ? Math.round(((stepsDone + (data?.timeline.some((s) => s.state === "current") ? 0.5 : 0)) / stepsTotal) * 100) : 0;
  const daysOpen = data ? Math.max(0, Math.floor((Date.now() - new Date(data.appliedOn).getTime()) / 86400000)) : 0;
  const w = walletPart.wallet;

  const kpis: Kpi[] = [
    { id: "status", label: "Application status", value: data ? label(data.status) : "—", format: "text", icon: "briefcase", href: "/clientos/application", tone: data?.rejected ? "bad" : data?.offer ? "good" : "default", hint: data?.positionTitle },
    { id: "pipeline", label: "Hiring progress", value: pipelinePct, format: "percent", icon: "trending", href: "/clientos/journey", hint: `${stepsDone}/${stepsTotal} stages` },
    { id: "interviews", label: "Interviews scheduled", value: upcomingIv.length, format: "number", icon: "calendar", href: "/clientos/interviews", hint: `${interviews.filter((i) => i.status === "completed").length} completed` },
    { id: "docs", label: "Documents ready", value: docs.length ? Math.round((docsDone / docs.length) * 100) : 0, format: "percent", icon: "file", href: "/clientos/documents", tone: docsDone < docs.length ? "warn" : "good", hint: `${docsDone}/${docs.length}` },
    { id: "apps", label: "Applications", value: applications.length, format: "number", icon: "clipboard", href: "/clientos/journey", hint: `${applications.filter((a) => a.status === "open").length} open` },
    { id: "offer", label: "Offer", value: data?.offer ? label(data.offer.status) : "None yet", format: "text", icon: "award", href: "/clientos/application", tone: data?.offer ? "good" : "default" },
    { id: "credits", label: "Credits available", value: w.available, format: "credits", icon: "coins", href: "/clientos/wallet", hint: w.expiringSoon > 0 ? `${w.expiringSoon} expiring soon` : undefined },
    { id: "referral", label: "Referral earnings", value: w.referral.credits, format: "credits", icon: "gift", href: "/clientos/referrals", hint: `${w.referral.rewarded} rewarded · ${w.referral.pending} pending` },
  ];

  const charts: ChartDef[] = [
    {
      id: "pipeline",
      title: "Hiring pipeline",
      subtitle: "Where you are in the process",
      section: "overview",
      kind: "hbar",
      href: "/clientos/journey",
      format: "percent",
      categories: (data?.timeline ?? []).map((s) => ({ name: s.label, value: s.state === "done" ? 100 : s.state === "current" ? 50 : 0, href: "/clientos/journey" })),
      emptyText: "Your pipeline appears once an application is on file.",
    },
    {
      id: "iv-status",
      title: "Interviews by status",
      section: "performance",
      kind: "donut",
      href: "/clientos/interviews",
      categories: Object.entries(interviews.reduce<Record<string, number>>((m, i) => ({ ...m, [label(i.status)]: (m[label(i.status)] ?? 0) + 1 }), {})).map(([name, value]) => ({ name, value, href: "/clientos/interviews" })),
      emptyText: "No interviews yet.",
    },
    {
      id: "doc-ready",
      title: "Document readiness",
      section: "performance",
      kind: "donut",
      href: "/clientos/documents",
      categories: [
        { name: "Provided", value: docsDone, href: "/clientos/documents" },
        { name: "Still needed", value: docs.length - docsDone, href: "/clientos/documents" },
      ].filter((c) => c.value > 0),
      emptyText: "No document checklist.",
    },
    {
      id: "app-stage",
      title: "Applications by stage",
      section: "overview",
      kind: "bar",
      href: "/clientos/journey",
      categories: Object.entries(applications.reduce<Record<string, number>>((m, a) => { const k = stageMeta(a.type, a.stage)?.label ?? a.stage; return { ...m, [k]: (m[k] ?? 0) + 1 }; }, {})).map(([name, value]) => ({ name, value, href: "/clientos/journey" })),
      emptyText: "No applications yet.",
    },
    ...walletPart.charts,
  ];

  const tables: TableDef[] = [
    {
      id: "interviews",
      title: "Interview schedule",
      href: "/clientos/interviews",
      exportName: "interviews",
      dateKey: "when",
      columns: [
        { key: "when", label: "When", type: "date" },
        { key: "title", label: "Interview" },
        { key: "round", label: "Round" },
        { key: "mode", label: "Mode", type: "badge" },
        { key: "status", label: "Status", type: "badge" },
      ],
      rows: interviews.map((i) => ({ cells: { when: i.scheduledAt, title: i.title, round: i.round, mode: i.mode, status: i.status }, href: "/clientos/interviews" })),
      emptyText: "No interviews scheduled yet.",
    },
    {
      id: "applications",
      title: "My applications",
      href: "/clientos/journey",
      exportName: "applications",
      dateKey: "applied",
      columns: [
        { key: "code", label: "Request" },
        { key: "role", label: "Position" },
        { key: "stage", label: "Stage", type: "badge" },
        { key: "outcome", label: "Outcome", type: "badge" },
        { key: "applied", label: "Applied", type: "date" },
      ],
      rows: applications.map((a) => ({ cells: { code: a.code, role: a.subService ?? "General application", stage: stageMeta(a.type, a.stage)?.label ?? a.stage, outcome: a.status === "won" ? "selected" : a.status === "lost" ? "closed" : "in progress", applied: a.createdAt.toISOString() }, href: "/clientos/journey" })),
      emptyText: "No applications yet.",
    },
    {
      id: "documents",
      title: "Document checklist",
      href: "/clientos/documents",
      exportName: "documents",
      columns: [
        { key: "name", label: "Document" },
        { key: "state", label: "Status", type: "badge" },
        { key: "note", label: "Note" },
      ],
      rows: docs.map((d) => ({ cells: { name: d.name, state: d.provided ? "provided" : "pending", note: d.note ?? null }, href: "/clientos/documents" })),
      emptyText: "No documents required.",
    },
    {
      id: "open-roles",
      title: "Open positions",
      href: "/careers",
      exportName: "open-positions",
      columns: [
        { key: "title", label: "Position" },
        { key: "category", label: "Category" },
      ],
      rows: openRoles.map((r) => ({ cells: { title: r.title, category: r.category ?? null }, href: `/careers/${r.slug}` })),
      emptyText: "No open positions right now.",
    },
    ...walletPart.tables,
  ];

  const pending: ActionItem[] = [];
  if (data && docsDone < docs.length) pending.push({ id: "docs", title: `${docs.length - docsDone} document${docs.length - docsDone === 1 ? "" : "s"} still needed`, detail: docs.filter((d) => !d.provided).map((d) => d.name).slice(0, 2).join(", "), href: "/clientos/documents", priority: "medium" });
  for (const iv of upcomingIv.slice(0, 3)) pending.push({ id: `iv-${iv._id}`, title: `Prepare: ${iv.title}`, detail: new Date(iv.scheduledAt).toLocaleString("en-IN"), href: "/clientos/interviews", priority: "high", due: iv.scheduledAt });
  if (data?.offer && data.offer.status !== "accepted") pending.push({ id: "offer", title: "You have an offer to review", href: "/clientos/application", priority: "high" });
  pending.push(...unreadAction(notif.unread));

  const upcoming: EventItem[] = upcomingIv.map((iv) => ({ id: `u-${iv._id}`, title: iv.title, detail: `${label(iv.mode)}${iv.round ? ` · ${iv.round}` : ""}`, at: iv.scheduledAt, href: "/clientos/interviews", kind: "interview" as const }));

  const completedFeed: FeedItem[] = [
    ...(data?.timeline.filter((s) => s.state === "done") ?? []).map((s, i) => ({ id: `st-${i}`, kind: "system" as const, title: `Stage completed: ${s.label}`, at: data!.lastUpdate, href: "/clientos/journey" })).slice(-3),
    ...interviews.filter((i) => i.status === "completed").slice(0, 3).map((i) => ({ id: `ic-${i._id}`, kind: "system" as const, title: `Interview completed: ${i.title}`, at: i.scheduledAt, href: "/clientos/interviews" })),
  ];

  const insights: Insight[] = [...walletPart.insights];
  if (data) {
    insights.push(data.rejected ? { id: "rej", type: "attention", title: "This application was not taken forward", body: "You can apply to other open positions below.", href: "/careers" } : data.offer ? { id: "offer", type: "good", title: "You have an offer", body: `${data.positionTitle} — review the details.`, href: "/clientos/application" } : { id: "days", type: "changed", title: `Application open for ${daysOpen} day${daysOpen === 1 ? "" : "s"}`, body: `Currently: ${label(data.status)}.`, href: "/clientos/journey" });
    if (docsDone < docs.length) insights.push({ id: "docready", type: "attention", title: "Complete your documents to speed things up", body: `${docsDone}/${docs.length} ready.`, href: "/clientos/documents" });
  }

  const recs: Recommendation[] = openRoles.slice(0, 3).map((r) => ({ id: `r-${r.slug}`, title: r.title, body: "Open position that matches your profile area.", href: `/careers/${r.slug}`, cta: "View role" }));
  recs.push(...walletPart.recommendations);

  const quick: QuickAction[] = filterActions(
    [
      { id: "q-app", label: "My application", href: "/clientos/application", icon: "file" },
      { id: "q-iv", label: "Interviews", href: "/clientos/interviews", icon: "calendar" },
      { id: "q-docs", label: "Upload documents", href: "/clientos/documents", icon: "shield" },
      { id: "q-refer", label: "Refer & earn", href: "/clientos/referrals", icon: "gift" },
      { id: "q-careers", label: "Open positions", href: "/careers", icon: "briefcase" },
    ],
    can
  );

  return {
    kind: "hiring",
    title: "Hiring dashboard",
    subtitle: data ? `${data.positionTitle} · applied ${new Date(data.appliedOn).toLocaleDateString("en-IN")}` : "Your recruitment overview",
    badge: "Candidate",
    kpis,
    charts,
    tables,
    timeline: mergeFeed(leadFeed(leadView), walletPart.feed),
    pending,
    completed: completedFeed,
    upcoming,
    insights,
    recommendations: recs,
    quickActions: quick,
    notifications: notif.items,
    unreadCount: notif.unread,
    wallet: walletPart.wallet,
    journey: journeyBlock(leadView),
    notice: data ? undefined : "We couldn't find an application record yet — the sections below still show your wallet, notifications and open positions.",
  };
}
