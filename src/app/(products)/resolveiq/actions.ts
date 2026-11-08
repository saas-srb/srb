"use server";

import { revalidatePath } from "next/cache";
import { askHelp, draftRequestFromChat, type HelpAnswer, type RequestDraft } from "@/lib/support/ai";
import { getCompanyCaller, takeAiAllowance } from "@/lib/support/caller";
import { companyReply, createRequest, type NewRequestInput } from "@/lib/support/requests";
import { notifySupportStaff } from "@/lib/support/notify";
import { requestsCol } from "@/lib/support/db";
import type { Attachment, ChatTurn, RequestContext } from "@/lib/support/types";

const SIGNED_OUT = "Please sign in again.";
const LIMIT = "You've reached the hourly limit for AI help. Please try again later or create a support request.";

/** Chat: one question in, one grounded answer out. */
export async function askHelpAction(messages: ChatTurn[], context: Partial<RequestContext> | null): Promise<HelpAnswer> {
  const caller = await getCompanyCaller();
  if (!caller) return { ok: false, error: SIGNED_OUT };
  if (!(await takeAiAllowance(caller.user.id))) return { ok: false, error: LIMIT };
  return askHelp({ messages, context });
}

/** The AI's prepared request (title, description, type, priority) for the user to review and edit — nothing is saved. */
export async function draftRequestAction(messages: ChatTurn[], context: Partial<RequestContext> | null): Promise<{ ok: true; draft: RequestDraft } | { ok: false; error: string }> {
  const caller = await getCompanyCaller();
  if (!caller) return { ok: false, error: SIGNED_OUT };
  if (!(await takeAiAllowance(caller.user.id))) return { ok: false, error: LIMIT };
  return { ok: true, draft: await draftRequestFromChat({ messages, context }) };
}

export async function createRequestAction(input: NewRequestInput): Promise<{ ok: true; id: string; number: number } | { ok: false; error: string }> {
  const caller = await getCompanyCaller();
  if (!caller) return { ok: false, error: SIGNED_OUT };
  const res = await createRequest(caller, input);
  if (res.ok) {
    revalidatePath("/resolveiq", "layout");
    await notifySupportStaff({ requestId: res.id, number: res.number, title: String(input.title ?? ""), companyName: caller.companyName, kind: "new" });
  }
  return res;
}

export async function replyRequestAction(id: string, body: string, attachments: Attachment[] = []): Promise<{ ok: true } | { ok: false; error: string }> {
  const caller = await getCompanyCaller();
  if (!caller) return { ok: false, error: SIGNED_OUT };
  const res = await companyReply(caller, String(id), String(body ?? ""), attachments);
  if (res.ok) {
    revalidatePath(`/resolveiq/requests/${id}`);
    const req = await (await requestsCol()).findOne({ _id: String(id), companyId: caller.companyId }, { projection: { number: 1, title: 1, assignee: 1 } });
    if (req) await notifySupportStaff({ requestId: String(id), number: req.number, title: req.title, companyName: caller.companyName, kind: "reply", assigneeId: req.assignee?.id ?? null });
  }
  return res;
}

/** The active request types and options for the request form (read at use time, so the platform team's changes show at once). */
export async function getRequestFormConfigAction() {
  const caller = await getCompanyCaller();
  if (!caller) return null;
  const { getSupportConfig } = await import("@/lib/support/config");
  const cfg = await getSupportConfig();
  return {
    types: cfg.types.filter((t) => t.active),
    priorities: cfg.priorities.filter((p) => p.active),
    categories: cfg.categories.filter((c) => c.active),
    severities: cfg.severities.filter((s) => s.active),
  };
}
