import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { CHANNELS, type ChannelKey } from "@/lib/notify/center/shared";
import { eventCatalog, type CatalogEvent } from "@/lib/notify/center/store";
import { eventDescription, eventName } from "@/lib/notify/center/event-names";
import { PDF_TYPES } from "@/lib/pdf/catalog";

/**
 * Cross-company numbers for the Platform Console's Notification center and Documents & PDFs pages. They read the shared collections
 * directly (every company's rows carry a `companyId`), and only ever return counts, never a company's content.
 */

export interface PlatformEvent extends CatalogEvent {
  /** Companies that turned this channel off for themselves. */
  companiesOff: Record<ChannelKey, number>;
}

export async function platformEvents(): Promise<PlatformEvent[]> {
  const db = await getPlatformDb();
  const rows = await db
    .collection("notification_rules")
    .aggregate<{ _id: string; inApp: number; push: number; email: number }>([
      { $match: { $or: CHANNELS.map((c) => ({ [`channels.${c}.enabled`]: false, [`channels.${c}.unavailable`]: { $ne: true } })) } },
      { $project: { key: { $arrayElemAt: [{ $split: ["$_id", "::"] }, 1] }, channels: 1 } },
      { $group: { _id: "$key", inApp: { $sum: { $cond: [{ $and: [{ $eq: ["$channels.inApp.enabled", false] }, { $ne: ["$channels.inApp.unavailable", true] }] }, 1, 0] } }, push: { $sum: { $cond: [{ $and: [{ $eq: ["$channels.push.enabled", false] }, { $ne: ["$channels.push.unavailable", true] }] }, 1, 0] } }, email: { $sum: { $cond: [{ $and: [{ $eq: ["$channels.email.enabled", false] }, { $ne: ["$channels.email.unavailable", true] }] }, 1, 0] } } } },
    ])
    .toArray()
    .catch(() => []);
  const off = new Map(rows.map((r) => [r._id, r]));
  const known = new Map(eventCatalog().map((e) => [e.key, e]));
  // Events that only exist because a company raised them (not in the catalog yet) are listed too.
  const seen = await db
    .collection("notification_rules")
    .aggregate<{ _id: string; product: string }>([{ $group: { _id: { $arrayElemAt: [{ $split: ["$_id", "::"] }, 1] }, product: { $first: "$product" } } }])
    .toArray()
    .catch(() => []);
  for (const s of seen) if (s._id && !known.has(s._id) && !s._id.startsWith("custom_")) known.set(s._id, { key: s._id, name: eventName(s._id), description: eventDescription(s._id), product: s.product || "workspace", locked: false, channels: [...CHANNELS] });
  return [...known.values()]
    .map((e) => ({ ...e, companiesOff: { inApp: off.get(e.key)?.inApp ?? 0, push: off.get(e.key)?.push ?? 0, email: off.get(e.key)?.email ?? 0 } }))
    .sort((a, b) => a.product.localeCompare(b.product) || a.name.localeCompare(b.name));
}

export interface DeliveryTotals {
  channel: ChannelKey;
  sent: number;
  failed: number;
  off: number;
}
/** What went out across every company in the last 24 hours, by channel. */
export async function deliveryTotals(): Promise<DeliveryTotals[]> {
  const since = new Date(Date.now() - 86_400_000);
  const rows = await (await getPlatformDb())
    .collection("notification_log")
    .aggregate<{ _id: { c: ChannelKey; s: "sent" | "failed" | "off" }; n: number }>([{ $match: { at: { $gte: since } } }, { $group: { _id: { c: "$channel", s: "$status" }, n: { $sum: 1 } } }])
    .toArray()
    .catch(() => []);
  return CHANNELS.map((channel) => ({ channel, sent: rows.find((r) => r._id.c === channel && r._id.s === "sent")?.n ?? 0, failed: rows.find((r) => r._id.c === channel && r._id.s === "failed")?.n ?? 0, off: rows.find((r) => r._id.c === channel && r._id.s === "off")?.n ?? 0 }));
}

export interface PlatformPdfStat {
  type: string;
  last30: number;
  total: number;
  companies: number;
  lastAt: string | null;
}
/** How much each kind of PDF was made across every company (last 30 days, and in the kept history), and by how many companies. */
export async function platformPdfStats(): Promise<Record<string, PlatformPdfStat>> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await (await getPlatformDb())
    .collection("pdf_activity")
    .aggregate<{ _id: string; total: number; last30: number; companies: string[]; last: Date }>([
      { $group: { _id: "$type", total: { $sum: 1 }, last30: { $sum: { $cond: [{ $gte: ["$at", since] }, 1, 0] } }, companies: { $addToSet: "$companyId" }, last: { $max: "$at" } } },
    ])
    .toArray()
    .catch(() => []);
  const out: Record<string, PlatformPdfStat> = {};
  for (const t of PDF_TYPES) out[t.key] = { type: t.key, last30: 0, total: 0, companies: 0, lastAt: null };
  for (const r of rows) if (out[r._id]) out[r._id] = { type: r._id, last30: r.last30, total: r.total, companies: r.companies.length, lastAt: r.last.toISOString() };
  return out;
}
