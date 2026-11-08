import "server-only";
import { getDb } from "@/lib/mongodb";
import { TRANSACTIONS_COLLECTION, type WalletTransaction } from "@/lib/wallet/transactions";
import { getWalletOverview } from "@/lib/products/clientos/wallet";
import { getEarnWays } from "@/lib/wallet/earn";
import { listReferralsForReferrer } from "@/lib/wallet/referrals";
import { listPortalNotifications, portalUnreadCount } from "@/lib/products/clientos/notifications";
import { txLabel, txSource, USAGE_MODULE_LABELS, isValidUsageModule, formatCredits } from "@/lib/wallet/constants";
import { PORTAL_NAV, type PortalRole } from "@/lib/portal-roles";
import type { CurrentPortalUser } from "@/lib/portal-auth";
import type { PortalLeadView } from "@/lib/products/clientos/lead";
import type { ChartDef, DashboardModel, FeedItem, Insight, QuickAction, Recommendation, TableDef, ActionItem } from "@/lib/products/clientos/dashboard/types";

/** Feature/product access: a link is only offered when the user's role actually has that page in its portal nav. */
export function accessFor(role: PortalRole) {
  const hrefs = new Set(PORTAL_NAV[role].map((i) => i.href));
  return { can: (href: string) => hrefs.has(href.split("?")[0]) || href.startsWith("/offers") || href.startsWith("/careers") || href.startsWith("/industrial-training") || href.startsWith("/internship-program") };
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const EARN_TYPES = ["signup_bonus", "referral_bonus_referrer", "referral_bonus_referee", "activity_reward", "manual_adjustment"];

export interface WalletPart {
  wallet: NonNullable<DashboardModel["wallet"]>;
  charts: ChartDef[];
  tables: TableDef[];
  feed: FeedItem[];
  insights: Insight[];
  recommendations: Recommendation[];
  earnedTotals: { current: number; previous: number };
}

/** Wallet, credit flow, where credits go, referral earnings, and recent transactions — one place, every dashboard. */
export async function buildWalletPart(user: CurrentPortalUser): Promise<WalletPart> {
  const [overview, referrals, ways] = await Promise.all([getWalletOverview(user.id), listReferralsForReferrer(user.id), getEarnWays(user).catch(() => [])]);
  const db = await getDb();
  const since = new Date(Date.now() - 365 * 86400000);
  const txs = await db
    .collection<WalletTransaction>(TRANSACTIONS_COLLECTION)
    .find({ userId: user.id, createdAt: { $gte: since }, type: { $nin: ["redemption_reserved", "redemption_released"] } })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();

  const byDay = new Map<string, { earned: number; spent: number }>();
  const sources = new Map<string, number>();
  const usage = new Map<string, number>();
  let curEarn = 0;
  let prevEarn = 0;
  const now = Date.now();
  for (const t of txs) {
    const k = day(t.createdAt);
    const row = byDay.get(k) ?? { earned: 0, spent: 0 };
    if (t.direction === "credit" && EARN_TYPES.includes(t.type)) {
      row.earned += t.amount;
      const src = txSource(t.type, t.metadata);
      sources.set(src, (sources.get(src) ?? 0) + t.amount);
      const age = (now - t.createdAt.getTime()) / 86400000;
      if (age <= 30) curEarn += t.amount;
      else if (age <= 60) prevEarn += t.amount;
    } else if (t.type === "redemption_confirmed" && t.status !== "reversed") {
      row.spent += t.amount;
      const mod = typeof t.metadata?.module === "string" && isValidUsageModule(t.metadata.module) ? USAGE_MODULE_LABELS[t.metadata.module] : "Festival Offers";
      usage.set(mod, (usage.get(mod) ?? 0) + t.amount);
    }
    byDay.set(k, row);
  }

  const referralCredits = referrals.reduce((s, r) => s + (r.status === "REWARDED" ? r.rewardAmounts?.referrer ?? 0 : 0), 0);
  const pendingRefs = referrals.filter((r) => r.status === "REGISTERED").length;
  const b = overview.balances;

  const charts: ChartDef[] = [
    {
      id: "wallet-flow",
      title: "Credits earned vs used",
      subtitle: "Daily credit movement",
      section: "wallet",
      kind: "area",
      href: "/clientos/wallet",
      series: [
        { key: "earned", label: "Earned", color: "green" },
        { key: "spent", label: "Used", color: "primary" },
      ],
      rows: [...byDay.entries()].sort(([a], [c]) => a.localeCompare(c)).map(([date, v]) => ({ date, ...v })),
      format: "credits",
      emptyText: "No credit activity in this range.",
    },
    {
      id: "credit-sources",
      title: "Where credits come from",
      section: "wallet",
      kind: "donut",
      href: "/clientos/wallet",
      categories: [...sources.entries()].map(([name, value]) => ({ name, value })),
      format: "credits",
      emptyText: "No credits earned yet.",
    },
    {
      id: "credit-usage",
      title: "Where credits are being used",
      section: "wallet",
      kind: "donut",
      href: "/clientos/wallet",
      categories: [...usage.entries()].map(([name, value]) => ({ name, value })),
      format: "credits",
      emptyText: "You haven't used credits yet.",
    },
  ];

  const tables: TableDef[] = [
    {
      id: "transactions",
      title: "Recent transactions",
      href: "/clientos/wallet",
      exportName: "wallet-transactions",
      dateKey: "date",
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "type", label: "Type" },
        { key: "amount", label: "Credits", type: "number", align: "right" },
        { key: "balance", label: "Balance after", type: "number", align: "right" },
      ],
      rows: txs.slice(0, 60).map((t) => ({
        cells: {
          date: t.createdAt.toISOString(),
          type: txLabel(t.type, t.metadata),
          amount: (t.direction === "credit" ? 1 : -1) * t.amount,
          balance: t.balanceAfter,
        },
        href: "/clientos/wallet",
      })),
      emptyText: "No transactions yet.",
    },
  ];

  const feed: FeedItem[] = txs.slice(0, 20).map((t) => ({
    id: `tx-${t._id}`,
    kind: t.direction === "credit" ? "credit" : "spend",
    title: `${t.direction === "credit" ? "+" : "−"}${t.amount.toLocaleString("en-IN")} credits · ${txLabel(t.type, t.metadata)}`,
    detail: t.reason,
    at: t.createdAt.toISOString(),
    href: "/clientos/wallet",
  }));

  const insights: Insight[] = [];
  if (overview.expiringSoon > 0)
    insights.push({ id: "expiring", type: "attention", title: `${formatCredits(overview.expiringSoon)} expiring within 30 days`, body: "Use them on an offer before they lapse.", href: "/offers" });
  if (curEarn > 0 || prevEarn > 0) {
    const pct = prevEarn > 0 ? Math.round(((curEarn - prevEarn) / prevEarn) * 100) : 100;
    insights.push({ id: "earn-change", type: pct >= 0 ? "good" : "changed", title: `Credits earned: ${curEarn.toLocaleString("en-IN")} in the last 30 days`, body: prevEarn > 0 ? `${pct >= 0 ? "Up" : "Down"} ${Math.abs(pct)}% from the 30 days before.` : "Nothing was earned in the 30 days before.", href: "/clientos/wallet" });
  }
  if (overview.status === "frozen") insights.push({ id: "frozen", type: "attention", title: "Your wallet is frozen", body: "Credits can't be used until support unfreezes it.", href: "/clientos/wallet" });

  const recommendations: Recommendation[] = [];
  if (b.available > 0) recommendations.push({ id: "use-credits", title: `Put your ${formatCredits(b.available)} to work`, body: "Apply credits to a live festival offer or an open fee/invoice.", href: "/offers", cta: "Browse offers" });
  for (const w of ways.filter((x) => !x.done && x.repeat !== "daily" && x.type !== "referral_referrer" && x.type !== "referral_referee").slice(0, 2))
    recommendations.push({ id: `earn-${w.id}`, title: `Earn +${w.amount.toLocaleString("en-IN")} credits: ${w.title}`, body: w.description, href: w.href, cta: w.cta });
  if (referrals.length === 0) recommendations.push({ id: "refer", title: "Invite a friend, earn credits", body: "You both earn when someone joins through your link.", href: "/clientos/referrals", cta: "Get my link" });

  return {
    wallet: {
      available: b.available,
      pending: b.pending,
      locked: b.locked,
      lifetimeEarned: b.lifetimeEarned,
      lifetimeRedeemed: b.lifetimeRedeemed,
      expiringSoon: overview.expiringSoon,
      frozen: overview.status === "frozen",
      referral: { total: referrals.length, pending: pendingRefs, rewarded: referrals.filter((r) => r.status === "REWARDED").length, credits: referralCredits },
    },
    charts,
    tables,
    feed,
    insights,
    recommendations,
    earnedTotals: { current: curEarn, previous: prevEarn },
  };
}

export async function buildNotifications(user: CurrentPortalUser) {
  const [items, unread] = await Promise.all([listPortalNotifications(user.id, 12), portalUnreadCount(user.id)]);
  return {
    unread,
    items: items.map((n) => ({ id: n._id, title: n.title, body: n.body, href: n.link, at: n.createdAt.toISOString(), read: n.read })),
  };
}

export function leadFeed(leadView: PortalLeadView | null): FeedItem[] {
  if (!leadView) return [];
  const events: FeedItem[] = leadView.events.slice(0, 15).map((e) => ({ id: `ev-${e._id}`, kind: "lead", title: e.title, detail: e.detail, at: e.createdAt, href: "/clientos/journey" }));
  const msgs: FeedItem[] = leadView.messages.slice(0, 8).map((m) => ({ id: `msg-${m._id}`, kind: "message", title: "New message from our team", detail: m.body?.slice(0, 120) ?? null, at: m.createdAt, href: "/clientos/messages" }));
  return [...events, ...msgs];
}

export function mergeFeed(...lists: FeedItem[][]): FeedItem[] {
  return lists.flat().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
}

export function unreadAction(unread: number): ActionItem[] {
  return unread > 0 ? [{ id: "unread", title: `${unread} unread notification${unread === 1 ? "" : "s"}`, href: "/clientos/notifications", priority: "low" }] : [];
}

export function filterActions(actions: QuickAction[], can: (href: string) => boolean): QuickAction[] {
  return actions.filter((a) => can(a.href));
}

export function journeyBlock(leadView: PortalLeadView | null): DashboardModel["journey"] {
  if (!leadView) return null;
  const steps = leadView.stageTimeline.map((s) => ({ label: s.label, state: s.state }));
  const next = steps.find((s) => s.state === "upcoming");
  return { code: leadView.lead.code, stageLabel: leadView.currentStagePortalLabel, steps, nextLabel: next?.label ?? null };
}
