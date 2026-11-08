import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import type { AiAnalysis, Attachment, ChatTurn, RequestContext } from "@/lib/support/types";

/**
 * The Help & Support Center is the platform's own service, so its data is NOT company-scoped: it lives in platform-level
 * collections (raw DB) and every row carries the `companyId` it belongs to. Every company-facing read in `requests.ts`
 * is built from `companyScope()` so one company can never see another's rows; only the Platform Console (staff) queries
 * across companies.
 */

export const SUPPORT_COLLECTIONS = {
  requests: "support_requests",
  messages: "support_messages",
  articles: "support_articles",
  config: "support_config",
  counters: "support_counters",
} as const;

export interface RequestDoc {
  _id: string;
  number: number;
  companyId: string;
  companyName: string;
  /** The company's plan includes priority support when it was raised. */
  prioritySupport?: boolean;
  createdBy: { id: string; email: string };
  type: string;
  title: string;
  description: string;
  category: string | null;
  priority: string;
  severity: string | null;
  status: string;
  team: string | null;
  assignee: { id: string; email: string } | null;
  fields: Record<string, string>;
  context: RequestContext | null;
  source: "form" | "chat";
  chat: ChatTurn[];
  attachments: Attachment[];
  ai: AiAnalysis | null;
  history: { at: Date; by: string; action: string; from?: string | null; to?: string | null }[];
  lastActor: "company" | "staff";
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export interface MessageDoc {
  _id: string;
  requestId: string;
  companyId: string;
  authorType: "company" | "staff" | "system";
  /** `internal` notes are never returned by a company-facing query. */
  visibility: "public" | "internal";
  authorId: string;
  authorLabel: string;
  body: string;
  attachments?: Attachment[];
  createdAt: Date;
}

export interface ArticleDoc {
  _id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string[];
  /** Product keys this article is about (matched against the user's current product for context-aware help). */
  panels: string[];
  status: "draft" | "published";
  createdAt: Date;
  updatedAt: Date;
}

let indexed = false;
async function ensureIndexes() {
  if (indexed) return;
  indexed = true;
  const db = await getPlatformDb();
  const C = SUPPORT_COLLECTIONS;
  await Promise.all([
    db.collection(C.requests).createIndex({ companyId: 1, updatedAt: -1 }),
    db.collection(C.requests).createIndex({ status: 1, updatedAt: -1 }),
    db.collection(C.requests).createIndex({ number: 1 }, { unique: true }),
    db.collection(C.requests).createIndex({ "attachments.key": 1 }, { sparse: true }),
    db.collection(C.messages).createIndex({ "attachments.key": 1 }, { sparse: true }),
    db.collection(C.messages).createIndex({ requestId: 1, createdAt: 1 }),
    db.collection(C.articles).createIndex({ slug: 1 }, { unique: true }),
    db.collection(C.articles).createIndex({ status: 1, updatedAt: -1 }),
  ]).catch(() => {});
}

export async function requestsCol() {
  await ensureIndexes();
  return (await getPlatformDb()).collection<RequestDoc>(SUPPORT_COLLECTIONS.requests);
}
export async function messagesCol() {
  await ensureIndexes();
  return (await getPlatformDb()).collection<MessageDoc>(SUPPORT_COLLECTIONS.messages);
}
export async function articlesCol() {
  await ensureIndexes();
  return (await getPlatformDb()).collection<ArticleDoc>(SUPPORT_COLLECTIONS.articles);
}
export async function configCol() {
  return (await getPlatformDb()).collection<{ _id: string } & Record<string, unknown>>(SUPPORT_COLLECTIONS.config);
}

export async function nextRequestNumber(): Promise<number> {
  const res = await (await getPlatformDb())
    .collection<{ _id: string; seq: number }>(SUPPORT_COLLECTIONS.counters)
    .findOneAndUpdate({ _id: "request" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  return res?.seq ?? 1;
}

/** The ONLY way a company-facing query selects rows: always pinned to the caller's company. */
export function companyScope(companyId: string): { companyId: string } {
  if (!companyId) throw new Error("A company is required for this query.");
  return { companyId };
}
