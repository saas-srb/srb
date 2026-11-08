import "server-only";
import { getCurrentIntelligenceUser } from "@/lib/intelligence-auth";
import { intelligenceCan } from "@/lib/intelligence-roles";
import { prepareTurn, executeTurn } from "@/lib/products/databrain-ai/turn";
import { deleteConversationAction } from "@/app/(products)/databrain-ai/(protected)/actions";
import { viaAction, f, fail } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * AI Intelligence for the agent. Business questions that span the whole company ("revenue by month", "which clients are most profitable")
 * are handed to the Intelligence engine, which reads only what the person may see and shows how each number was calculated.
 */

const can = (u: AgentUser) => intelligenceCan({ roles: u.roles, permissionOverrides: u.permissionOverrides }, "USE");

export const INTELLIGENCE_ENTITIES: EntityDef[] = [
  { key: "intelligence.conversation", panel: "intelligence", label: "Intelligence conversation", description: "Your past questions to DataBrain.", collection: "intel_conversations", idType: "string", titleField: "title", search: ["title"], read: "any", allowRead: can, self: (u) => ({ userId: u.id }), scope: (u) => ({ userId: u.id }) },
];

export const INTELLIGENCE_ACTIONS: ActionDef[] = [
  { key: "intelligence.delete_conversation", panel: "intelligence", label: "Delete a past Intelligence conversation", description: "Delete one of your own saved conversations.", level: "any", allow: can, destructive: true, params: [f.ref("conversationId", "Conversation id", "intelligence.conversation", true)], run: (v) => viaAction(() => deleteConversationAction(String(v.conversationId)), "Conversation deleted.") },
];

function render(blocks: unknown[]): string {
  const out: string[] = [];
  for (const b of blocks as Json[]) {
    if (b.type === "text") out.push(String(b.markdown ?? ""));
    else if (b.type === "kpi") out.push(`**${String(b.label)}:** ${String(b.value)}`);
    else if (b.type === "list") out.push(`${b.title ? `**${String(b.title)}**\n` : ""}${((b.items as string[]) ?? []).map((x) => `- ${x}`).join("\n")}`);
    else if (b.type === "table" || b.type === "chart") {
      const cols = (b.columns as { key: string; label: string }[]) ?? [];
      const rows = ((b.rows as Json[]) ?? []).slice(0, 30);
      out.push(`${b.title ? `**${String(b.title)}**\n` : ""}| ${cols.map((c) => c.label).join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${cols.map((c) => String(r[c.key] ?? "")).join(" | ")} |`).join("\n")}${b.truncated ? "\n(more rows not shown)" : ""}`);
    }
  }
  return out.join("\n\n");
}

export const INTELLIGENCE_REPORTS: ReportDef[] = [
  {
    key: "intelligence.ask", panel: "intelligence", label: "Ask the whole-company analytics engine", description: "A plain-language question about company data across products (totals, trends, rankings, breakdowns). Returns the answer with tables and the figures it calculated. Counts toward the hourly question limit.", level: "any", allow: can,
    params: [f.text("question", "The question, in plain language", true), f.str("conversationId", "Continue an earlier Intelligence conversation (optional)")],
    run: async (v) => {
      const user = await getCurrentIntelligenceUser();
      if (!user) return fail("Please sign in again.");
      const prep = await prepareTurn(user, { message: v.question, conversationId: v.conversationId });
      if (!prep.ok) return fail(prep.error);
      const res = await executeTurn(user, prep);
      if (!res.ok) return fail(res.error);
      const m = res.message as unknown as { text?: string; blocks?: unknown[] };
      return { conversationId: prep.conversation._id, answer: m.blocks?.length ? render(m.blocks) : m.text ?? "" };
    },
  },
];
