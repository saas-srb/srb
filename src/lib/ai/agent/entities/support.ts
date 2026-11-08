import "server-only";
import * as S from "@/app/(products)/resolveiq/actions";
import { getCompanyCaller } from "@/lib/support/caller";
import { countForCompany, getForCompany, listForCompany } from "@/lib/support/requests";
import { getSupportConfig } from "@/lib/support/config";
import { searchArticles } from "@/lib/support/articles";
import { f, str, viaAction } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, Json, ReportDef } from "@/lib/ai/agent/types";

/** Help & Support (the company's side): look up help articles, follow your company's requests, raise a new one, reply to the support team. */

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Json;
const rep = (key: string, label: string, description: string, params: ReportDef["params"], run: (v: Json) => Promise<unknown>): ReportDef => ({ key, panel: "support", label, description, level: "any", params, run: async (v) => json(await run(v)) });

export const SUPPORT_REPORTS: ReportDef[] = [
  rep("support.search_help", "Search help articles", "Find published help articles about a topic (use this before raising a request).", [f.str("query", "What the person needs help with", true)], async (v) => (await searchArticles(String(v.query ?? ""), { limit: 6 })).map((a) => ({ title: a.title, summary: a.summary, slug: a.slug, url: `/resolveiq/help/${a.slug}`, body: a.body.slice(0, 1500) }))),
  rep("support.request_form", "Request types and options", "The request types, priorities, categories and severities you can choose when raising a request.", [], async () => { const c = await getSupportConfig(); return { types: c.types.filter((t) => t.active), priorities: c.priorities.filter((p) => p.active), categories: c.categories.filter((x) => x.active), severities: c.severities.filter((s) => s.active) }; }),
  rep("support.my_requests", "Your company's support requests", "Requests raised by your company; give a request id for the whole conversation.", [f.str("requestId", "Request id"), f.enum("state", "State", ["all", "open", "waiting", "resolved", "closed"]), f.str("q", "Search")], async (v) => {
    const caller = await getCompanyCaller();
    if (!caller) return { error: "Please sign in again." };
    if (str(v.requestId)) return (await getForCompany(caller.companyId, String(v.requestId))) ?? { error: "Request not found." };
    return { counts: await countForCompany(caller.companyId), requests: await listForCompany(caller.companyId, { state: (str(v.state) as "all") ?? "all", q: str(v.q) ?? undefined }) };
  }),
];

export const SUPPORT_ACTIONS: ActionDef[] = [
  {
    key: "support.create_request", panel: "support", label: "Raise a support request", level: "any",
    description: "Send a request to the SelfRun support team. Ask for the type first (see support.request_form), then a clear title and description.",
    params: [f.str("type", "Request type key", true), f.str("title", "Title", true), f.text("description", "Description with the steps and what you expected", true), f.str("category", "Category key"), f.str("priority", "Priority key"), f.str("severity", "Severity key")],
    run: (v) => viaAction(() => S.createRequestAction({ type: String(v.type ?? ""), title: String(v.title ?? ""), description: String(v.description ?? ""), category: str(v.category), priority: str(v.priority), severity: str(v.severity), source: "chat" }), "Request sent to the support team."),
  },
  {
    key: "support.reply_request", panel: "support", label: "Reply on a support request", level: "any",
    description: "Add a message to one of your company's requests.",
    params: [f.str("requestId", "Request id", true), f.text("body", "Message", true)],
    run: (v) => viaAction(() => S.replyRequestAction(String(v.requestId ?? ""), String(v.body ?? "")), "Reply sent."),
  },
];
