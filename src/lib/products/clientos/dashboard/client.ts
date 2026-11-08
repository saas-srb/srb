import "server-only";
import type { ClientOverview } from "@/lib/products/clientos/client";
import { listInvoicesForCustomer } from "@/lib/products/cashflow-ai/invoices";
import { invoiceBalance } from "@/lib/products/cashflow-ai/constants";
import { listLeadsForUser } from "@/lib/lead-management/records";
import { stageMeta } from "@/lib/lead-management/workflows";
import type { CurrentPortalUser } from "@/lib/portal-auth";
import type { PortalLeadView } from "@/lib/products/clientos/lead";
import { accessFor, buildWalletPart, buildNotifications, leadFeed, journeyBlock, mergeFeed, unreadAction, filterActions } from "@/lib/products/clientos/dashboard/common";
import type { ActionItem, ChartDef, DashboardModel, EventItem, FeedItem, Insight, Kpi, QuickAction, Recommendation, TableDef } from "@/lib/products/clientos/dashboard/types";

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Client and Business dashboards share one builder. "Business" is a client
 * account that has hiring / resource-augmentation requests on file — it adds a
 * requirements pipeline and contract view on top of the client sections.
 */
export async function buildClientDashboard(user: CurrentPortalUser, data: ClientOverview | null, leadView: PortalLeadView | null): Promise<DashboardModel> {
  const { can } = accessFor(user.role);
  const clientId = data?.client._id ?? user.clientId ?? null;
  const [walletPart, notif, invoices, leads] = await Promise.all([
    buildWalletPart(user),
    buildNotifications(user),
    clientId ? listInvoicesForCustomer(clientId, 200).catch(() => []) : Promise.resolve([]),
    listLeadsForUser(user.id).catch(() => []),
  ]);
  const hiringLeads = leads.filter((l) => l.source === "resource_augmentation");
  const isBusiness = hiringLeads.length > 0;

  const liveInvoices = invoices.filter((i) => i.status !== "void" && i.status !== "draft" && i.status !== "cancelled");
  const invTotal = liveInvoices.reduce((s, i) => s + i.totalAmount, 0);
  const invPaid = liveInvoices.reduce((s, i) => s + i.amountPaid, 0);
  const invCredited = liveInvoices.reduce((s, i) => s + i.amountCredited, 0);
  const invBalance = liveInvoices.reduce((s, i) => s + Math.max(invoiceBalance(i), 0), 0);
  const overdue = liveInvoices.filter((i) => invoiceBalance(i) > 0.01 && i.dueDate < today());

  const projects = data?.projects ?? [];
  const activeProjects = projects.filter((p) => p.project.status !== "completed" && p.project.status !== "cancelled");
  const doneProjects = projects.filter((p) => p.project.status === "completed");
  const milestones = projects.flatMap((p) => p.milestones.map((m) => ({ ...m, projectName: p.project.name })));
  const msDone = milestones.filter((m) => m.status === "completed").length;
  const msOverdue = milestones.filter((m) => m.overdue && m.status !== "completed");
  const contractValue = projects.reduce((s, p) => s + (p.project.estimatedBudget ?? 0), 0);
  const w = walletPart.wallet;
  const openHiring = hiringLeads.filter((l) => l.status === "open");

  const kpis: Kpi[] = [
    { id: "active", label: "Active projects", value: activeProjects.length, format: "number", icon: "folder", href: "/clientos/projects", hint: `${doneProjects.length} completed` },
    { id: "progress", label: "Overall progress", value: data?.overallProgress ?? 0, format: "percent", icon: "trending", href: "/clientos/projects" },
    { id: "milestones", label: "Milestones done", value: `${msDone}/${milestones.length}`, format: "text", icon: "flag", href: "/clientos/milestones", tone: msOverdue.length ? "warn" : "good", hint: msOverdue.length ? `${msOverdue.length} overdue` : undefined },
    { id: "outstanding", label: "Outstanding invoices", value: invBalance, format: "currency", icon: "receipt", href: "/clientos/invoices", tone: overdue.length ? "bad" : invBalance > 0 ? "warn" : "good", hint: overdue.length ? `${overdue.length} overdue` : undefined },
    { id: "paid", label: "Paid to date", value: invPaid + invCredited, format: "currency", icon: "check", href: "/clientos/invoices", hint: invTotal > 0 ? `${Math.round(((invPaid + invCredited) / invTotal) * 100)}% of billed` : undefined },
    { id: "credits", label: "Credits available", value: w.available, format: "credits", icon: "coins", href: "/clientos/wallet", hint: w.expiringSoon > 0 ? `${w.expiringSoon} expiring soon` : "Usable on invoices", delta: walletPart.earnedTotals.previous > 0 ? { pct: Math.round(((walletPart.earnedTotals.current - walletPart.earnedTotals.previous) / walletPart.earnedTotals.previous) * 100), label: "earned vs prev 30d" } : undefined },
    { id: "referral", label: "Referral earnings", value: w.referral.credits, format: "credits", icon: "gift", href: "/clientos/referrals", hint: `${w.referral.rewarded} rewarded · ${w.referral.pending} pending` },
  ];
  if (contractValue > 0) kpis.splice(6, 0, { id: "contract", label: "Contract value", value: contractValue, format: "currency", icon: "briefcase", href: "/clientos/projects" });
  if (isBusiness) kpis.splice(2, 0, { id: "requirements", label: "Open hiring requirements", value: openHiring.length, format: "number", icon: "users", href: "/clientos/journey", hint: `${hiringLeads.length} total requests` });

  const byMonth = new Map<string, { billed: number; collected: number }>();
  for (const i of liveInvoices) {
    const k = i.invoiceDate.slice(0, 10);
    const row = byMonth.get(k) ?? { billed: 0, collected: 0 };
    row.billed += i.totalAmount;
    row.collected += i.amountPaid + i.amountCredited;
    byMonth.set(k, row);
  }
  const count = <T,>(items: T[], f: (t: T) => string) => {
    const m = new Map<string, number>();
    for (const it of items) m.set(f(it), (m.get(f(it)) ?? 0) + 1);
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  };
  const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  const charts: ChartDef[] = [
    {
      id: "project-progress",
      title: "Project progress",
      section: "overview",
      kind: "hbar",
      href: "/clientos/projects",
      format: "percent",
      categories: projects.map((p) => ({ name: p.project.name.slice(0, 24), value: p.project.progressPercent, href: "/clientos/projects" })),
      emptyText: "No projects yet.",
    },
    {
      id: "milestone-status",
      title: "Milestones by status",
      section: "overview",
      kind: "donut",
      href: "/clientos/milestones",
      categories: count(milestones, (m) => label(m.status)).map((c) => ({ ...c, href: "/clientos/milestones" })),
      emptyText: "No milestones yet.",
    },
    {
      id: "billing-trend",
      title: "Billed vs collected",
      subtitle: "By invoice date",
      section: "money",
      kind: "area",
      href: "/clientos/invoices",
      series: [
        { key: "billed", label: "Billed", color: "blue" },
        { key: "collected", label: "Collected", color: "green" },
      ],
      rows: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
      format: "currency",
      emptyText: "No invoices in this range.",
    },
    {
      id: "invoice-status",
      title: "Invoices by status",
      section: "money",
      kind: "donut",
      href: "/clientos/invoices",
      categories: count(liveInvoices, (i) => (i.status === "sent" && i.dueDate < today() && invoiceBalance(i) > 0.01 ? "Overdue" : label(i.status))).map((c) => ({ ...c, href: "/clientos/invoices" })),
      emptyText: "No invoices yet.",
    },
  ];
  if (isBusiness) {
    charts.push({
      id: "hiring-pipeline",
      title: "Hiring requirements by stage",
      section: "performance",
      kind: "donut",
      href: "/clientos/journey",
      categories: count(hiringLeads, (l) => stageMeta(l.type, l.stage)?.label ?? l.stage).map((c) => ({ ...c, href: "/clientos/journey" })),
      emptyText: "No hiring requirements yet.",
    });
    charts.push({
      id: "hiring-outcome",
      title: "Requirement outcomes",
      section: "performance",
      kind: "bar",
      href: "/clientos/journey",
      categories: count(hiringLeads, (l) => (l.status === "won" ? "Engaged" : l.status === "lost" ? "Closed" : "In progress")).map((c) => ({ ...c, href: "/clientos/journey" })),
      emptyText: "No hiring requirements yet.",
    });
  }
  charts.push(...walletPart.charts);

  const tables: TableDef[] = [
    {
      id: "projects",
      title: isBusiness ? "Projects & contracts" : "Projects",
      href: "/clientos/projects",
      exportName: "projects",
      dateKey: "end",
      columns: [
        { key: "name", label: "Project" },
        { key: "code", label: "Code" },
        { key: "status", label: "Status", type: "badge" },
        { key: "progress", label: "Progress %", type: "number", align: "right" },
        { key: "end", label: "Delivery", type: "date" },
        { key: "value", label: "Contract value", type: "currency", align: "right" },
      ],
      rows: projects.map((p) => ({ cells: { name: p.project.name, code: p.project.projectCode, status: p.project.status, progress: p.project.progressPercent, end: p.project.endDate ? `${p.project.endDate}T00:00:00.000Z` : null, value: p.project.estimatedBudget ?? null }, href: "/clientos/projects" })),
      emptyText: "No projects yet.",
    },
    {
      id: "milestones",
      title: "Milestones",
      href: "/clientos/milestones",
      exportName: "milestones",
      dateKey: "due",
      columns: [
        { key: "project", label: "Project" },
        { key: "name", label: "Milestone" },
        { key: "due", label: "Due", type: "date" },
        { key: "status", label: "Status", type: "badge" },
        { key: "progress", label: "Progress %", type: "number", align: "right" },
      ],
      rows: milestones.map((m) => ({ cells: { project: m.projectName, name: m.name, due: m.dueDate ? `${m.dueDate}T00:00:00.000Z` : null, status: m.overdue && m.status !== "completed" ? "overdue" : m.status, progress: m.progressPercent }, href: "/clientos/milestones" })),
      emptyText: "No milestones yet.",
    },
    {
      id: "invoices",
      title: "Invoices & payments",
      href: "/clientos/invoices",
      exportName: "invoices",
      dateKey: "date",
      columns: [
        { key: "number", label: "Invoice" },
        { key: "date", label: "Date", type: "date" },
        { key: "due", label: "Due", type: "date" },
        { key: "status", label: "Status", type: "badge" },
        { key: "total", label: "Total", type: "currency", align: "right" },
        { key: "balance", label: "Balance", type: "currency", align: "right" },
      ],
      rows: liveInvoices.map((i) => ({ cells: { number: i.invoiceNumber, date: `${i.invoiceDate.slice(0, 10)}T00:00:00.000Z`, due: `${i.dueDate.slice(0, 10)}T00:00:00.000Z`, status: invoiceBalance(i) > 0.01 && i.dueDate < today() ? "overdue" : i.status, total: i.totalAmount, balance: Math.max(invoiceBalance(i), 0) }, href: "/clientos/invoices" })),
      emptyText: "No invoices yet.",
    },
    {
      id: "support",
      title: "Support & messages",
      href: "/clientos/messages",
      exportName: "messages",
      dateKey: "date",
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "channel", label: "Channel" },
        { key: "message", label: "Message" },
      ],
      rows: (leadView?.messages ?? []).slice(0, 40).map((m) => ({ cells: { date: m.createdAt, channel: m.channel, message: m.body.slice(0, 140) }, href: "/clientos/messages" })),
      emptyText: "No messages yet.",
    },
  ];
  if (isBusiness) {
    tables.push({
      id: "requirements",
      title: "Hiring requirements",
      href: "/clientos/journey",
      exportName: "hiring-requirements",
      dateKey: "created",
      columns: [
        { key: "code", label: "Request" },
        { key: "need", label: "Requirement" },
        { key: "stage", label: "Stage", type: "badge" },
        { key: "outcome", label: "Outcome", type: "badge" },
        { key: "created", label: "Raised", type: "date" },
      ],
      rows: hiringLeads.map((l) => ({ cells: { code: l.code, need: l.subService ? label(l.subService.replace(/-/g, "_")) : "General staffing", stage: stageMeta(l.type, l.stage)?.label ?? l.stage, outcome: l.status === "won" ? "engaged" : l.status === "lost" ? "closed" : "in progress", created: l.createdAt.toISOString() }, href: "/clientos/journey" })),
      emptyText: "No hiring requirements yet.",
    });
  }
  tables.push(...walletPart.tables);

  const pending: ActionItem[] = [];
  for (const i of overdue.slice(0, 4)) pending.push({ id: `inv-${i._id}`, title: `Overdue invoice ${i.invoiceNumber}`, detail: `${inr(invoiceBalance(i))} due ${i.dueDate.slice(0, 10)} — credits can be applied`, href: "/clientos/invoices", priority: "high", due: i.dueDate });
  for (const i of liveInvoices.filter((x) => invoiceBalance(x) > 0.01 && x.dueDate >= today()).slice(0, 3)) pending.push({ id: `invd-${i._id}`, title: `Invoice ${i.invoiceNumber} due`, detail: `${inr(invoiceBalance(i))} by ${i.dueDate.slice(0, 10)}`, href: "/clientos/invoices", priority: "medium", due: i.dueDate });
  for (const m of msOverdue.slice(0, 4)) pending.push({ id: `ms-${m._id}`, title: `Overdue milestone: ${m.name}`, detail: m.projectName, href: "/clientos/milestones", priority: "high", due: m.dueDate ?? undefined });
  const deliverables = projects.reduce((s, p) => s + p.pendingDeliverables.length, 0);
  if (deliverables > 0) pending.push({ id: "deliv", title: `${deliverables} deliverable${deliverables === 1 ? "" : "s"} awaiting completion`, href: "/clientos/milestones", priority: "low" });
  pending.push(...unreadAction(notif.unread));

  const upcoming: EventItem[] = [
    ...(data?.upcomingMeetings ?? []).map((m, i) => ({ id: `up-${i}`, title: m.title, detail: m.projectName, at: `${m.date}T09:00:00`, href: "/clientos/meetings", kind: (m.kind === "delivery" ? "delivery" : "milestone") as EventItem["kind"] })),
    ...liveInvoices.filter((i) => invoiceBalance(i) > 0.01 && i.dueDate >= today()).map((i) => ({ id: `pay-${i._id}`, title: `Payment due: ${i.invoiceNumber}`, detail: inr(invoiceBalance(i)), at: `${i.dueDate.slice(0, 10)}T09:00:00`, href: "/clientos/invoices", kind: "payment" as const })),
  ].sort((a, b) => a.at.localeCompare(b.at)).slice(0, 8);

  const completedFeed: FeedItem[] = [
    ...milestones.filter((m) => m.status === "completed" && m.completedAt).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")).slice(0, 4).map((m) => ({ id: `mc-${m._id}`, kind: "system" as const, title: `Milestone completed: ${m.name}`, detail: m.projectName, at: m.completedAt as string, href: "/clientos/milestones" })),
    ...liveInvoices.filter((i) => invoiceBalance(i) <= 0.01).slice(0, 3).map((i) => ({ id: `ip-${i._id}`, kind: "system" as const, title: `Invoice ${i.invoiceNumber} settled`, at: (i.updatedAt ?? i.createdAt).toISOString(), href: "/clientos/invoices" })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  const insights: Insight[] = [...walletPart.insights];
  if (overdue.length) insights.push({ id: "od", type: "attention", title: `${overdue.length} invoice${overdue.length === 1 ? " is" : "s are"} overdue`, body: `${inr(overdue.reduce((s, i) => s + invoiceBalance(i), 0))} outstanding. Credits can reduce the balance.`, href: "/clientos/invoices" });
  if (msOverdue.length) insights.push({ id: "mo", type: "attention", title: `${msOverdue.length} milestone${msOverdue.length === 1 ? " is" : "s are"} past due`, body: msOverdue.map((m) => m.name).slice(0, 3).join(", "), href: "/clientos/milestones" });
  if (milestones.length) insights.push({ id: "mp", type: "good", title: `${Math.round((msDone / milestones.length) * 100)}% of milestones delivered`, body: `${msDone} of ${milestones.length} complete across ${projects.length} project${projects.length === 1 ? "" : "s"}.`, href: "/clientos/milestones" });
  if (invTotal > 0) insights.push({ id: "collect", type: "changed", title: `${Math.round(((invPaid + invCredited) / invTotal) * 100)}% of billed amount settled`, body: `${inr(invBalance)} still open across ${liveInvoices.length} invoice(s).`, href: "/clientos/invoices" });
  for (const p of projects.filter((x) => x.project.health === "overdue").slice(0, 2)) insights.push({ id: `h-${p.project._id}`, type: "attention", title: `${p.project.name} is overdue`, body: "Your account manager can walk you through recovery.", href: "/clientos/projects" });

  const recs: Recommendation[] = [...walletPart.recommendations];
  if (!isBusiness) recs.push({ id: "hire", title: "Need dedicated developers?", body: "Extend your team with vetted engineers on flexible terms.", href: "/resource-augmentation", cta: "Explore staffing" });
  recs.push({ id: "svc", title: "Explore more services", body: "AI automation and software development offers are live now.", href: "/offers", cta: "See offers" });

  const quick: QuickAction[] = filterActions(
    [
      { id: "q-inv", label: "Pay / use credits", href: "/clientos/invoices", icon: "receipt" },
      { id: "q-proj", label: "My projects", href: "/clientos/projects", icon: "folder" },
      { id: "q-ms", label: "Milestones", href: "/clientos/milestones", icon: "flag" },
      { id: "q-meet", label: "Meetings", href: "/clientos/meetings", icon: "calendar" },
      { id: "q-msg", label: "Contact team", href: "/clientos/messages", icon: "message" },
      { id: "q-refer", label: "Refer & earn", href: "/clientos/referrals", icon: "gift" },
      { id: "q-offers", label: "Browse offers", href: "/offers", icon: "sparkles" },
    ],
    can
  );

  return {
    kind: isBusiness ? "business" : "client",
    title: isBusiness ? "Business dashboard" : "Client dashboard",
    subtitle: data ? `${data.client.companyName}${data.client.industry ? ` · ${data.client.industry}` : ""}` : "Your account overview",
    badge: isBusiness ? "Business · Hiring & services" : "Client",
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
    notice: data ? undefined : "Your project workspace appears here once our team sets up your first project. Everything else below is live.",
  };
}
