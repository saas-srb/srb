"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { notifyUsers } from "@/lib/notify";
import { analyzeRequest } from "@/lib/support/ai";
import { deleteArticle, saveArticle, type ArticleInput } from "@/lib/support/articles";
import { getSupportConfig, saveSupportConfig, stateOf, statusOf } from "@/lib/support/config";
import { getAnyRequest, saveAnalysis, staffReply, updateRequestStaff, type RequestView, type StaffPatch } from "@/lib/support/requests";
import type { AiAnalysis, SupportConfig } from "@/lib/support/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Tells the person who sent the request, inside their own company's notifications. Never breaks the staff action. */
async function notifyRequester(req: RequestView, title: string, body: string) {
  try {
    await runAsCompany(req.companyId, () => notifyUsers("support", [req.createdBy.id], { type: "support_update", title, body, link: `/resolveiq/requests/${req._id}`, priority: "normal" }));
  } catch (err) {
    console.error("[support] requester notification failed", err);
  }
}

function touch(id: string) {
  revalidatePath("/console/resolveiq");
  revalidatePath(`/console/resolveiq/${id}`);
}

export async function updateRequestAction(id: string, patch: StaffPatch): Promise<Result> {
  const auth = await checkPlatformPermission("support.manage");
  if (!auth.ok) return auth;
  const cfg = await getSupportConfig();
  const res = await updateRequestStaff(String(id), patch, auth.user.email, cfg);
  if (!res.ok) return res;
  await recordPlatformAudit({ actorId: auth.user.id, action: "support.request.update", target: { type: "support_request", id: res.request._id }, companyId: res.request.companyId, details: { fields: Object.keys(patch) } });
  if (res.statusChanged) {
    const label = statusOf(cfg, res.request.status)?.label ?? res.request.status;
    const state = stateOf(cfg, res.request.status);
    if (state === "resolved" || state === "closed" || state === "waiting") await notifyRequester(res.request, `Request #${res.request.number}: ${label}`, state === "waiting" ? "SelfRun AI needs a bit more information from you." : res.request.title);
  }
  touch(String(id));
  return { ok: true };
}

export async function replyAction(id: string, body: string, internal: boolean): Promise<Result> {
  const auth = await checkPlatformPermission("support.manage");
  if (!auth.ok) return auth;
  const cfg = await getSupportConfig();
  const res = await staffReply(String(id), { id: auth.user.id, email: auth.user.email }, String(body ?? ""), internal === true, cfg);
  if (!res.ok) return res;
  await recordPlatformAudit({ actorId: auth.user.id, action: internal ? "support.request.note" : "support.request.reply", target: { type: "support_request", id: res.request._id }, companyId: res.request.companyId });
  if (!internal) await notifyRequester(res.request, `SelfRun AI replied to request #${res.request.number}`, String(body).slice(0, 200));
  touch(String(id));
  return { ok: true };
}

export async function analyzeAction(id: string): Promise<Result<{ analysis: AiAnalysis }>> {
  const auth = await checkPlatformPermission("support.manage");
  if (!auth.ok) return auth;
  const found = await getAnyRequest(String(id));
  if (!found) return { ok: false, error: "Request not found." };
  const analysis = await analyzeRequest(found.request);
  await saveAnalysis(found.request._id, analysis);
  await recordPlatformAudit({ actorId: auth.user.id, action: "support.request.analyze", target: { type: "support_request", id: found.request._id }, companyId: found.request.companyId });
  touch(String(id));
  return { ok: true, analysis };
}

export async function saveArticleAction(input: ArticleInput): Promise<Result<{ id: string }>> {
  const auth = await checkPlatformPermission("support.manage");
  if (!auth.ok) return auth;
  const res = await saveArticle(input);
  if (!res.ok) return res;
  await recordPlatformAudit({ actorId: auth.user.id, action: input.id ? "support.article.update" : "support.article.create", target: { type: "support_article", id: res.id }, details: { title: String(input.title).slice(0, 120), status: input.status } });
  revalidatePath("/console/resolveiq/help");
  revalidatePath("/resolveiq", "layout");
  return res;
}

export async function deleteArticleAction(id: string): Promise<Result> {
  const auth = await checkPlatformPermission("support.manage");
  if (!auth.ok) return auth;
  await deleteArticle(String(id));
  await recordPlatformAudit({ actorId: auth.user.id, action: "support.article.delete", target: { type: "support_article", id: String(id) } });
  revalidatePath("/console/resolveiq/help");
  revalidatePath("/resolveiq", "layout");
  return { ok: true };
}

export async function saveConfigAction(config: Partial<SupportConfig>): Promise<Result> {
  const auth = await checkPlatformPermission("support.manage");
  if (!auth.ok) return auth;
  const res = await saveSupportConfig(config);
  if (!res.ok) return res;
  await recordPlatformAudit({ actorId: auth.user.id, action: "support.settings.update", target: { type: "support_config", id: "main" }, details: { types: res.config.types.length, statuses: res.config.statuses.length } });
  revalidatePath("/console/resolveiq", "layout");
  revalidatePath("/resolveiq", "layout");
  return { ok: true };
}

