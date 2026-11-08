import { workspaceEvents } from "@/lib/notify/triggers/workspace";
import "server-only";
import { randomUUID } from "node:crypto";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";
import { notify } from "@/lib/platform/notifications";
import { actorEmails, runInWorkflowScope, type PlatformEvent } from "@/lib/platform/events";
import { eventDef, eventLabel, type EventType } from "@/lib/platform/events/catalog";
import { workflowCollections, type WorkflowDoc } from "@/lib/platform/workflows";
import { isEmailAddress, matchesAll, renderTemplate, type EventContext, type WorkflowAction } from "@/lib/platform/workflows/shared";
import { deliverWebhook } from "@/lib/platform/workflows/webhook";
import { isPhoneNumber, sendWhatsApp } from "@/lib/platform/messaging";

/** Executes workflows for an event. Called by the event bus after the response; never throws. */

export interface RunnableEvent {
  id: string | null;
  type: EventType;
  at: Date;
  entity: PlatformEvent["entity"];
  ctx: EventContext;
}

/** The flat values a workflow reads for an event: its data, plus label / url / actorEmail / source. */
export async function buildContext(event: Pick<PlatformEvent, "data" | "entity" | "actorId" | "source">): Promise<EventContext> {
  let actorEmail: string | null = null;
  try {
    actorEmail = event.actorId ? ((await actorEmails([event.actorId])).get(event.actorId) ?? null) : null;
  } catch {
    actorEmail = null;
  }
  return { ...event.data, label: event.entity.label, url: event.entity.url, actorEmail, source: event.source };
}

export function buildWorkflowEmail(action: Extract<WorkflowAction, { type: "email" }>, ctx: EventContext, opts: { brand: string; link: string | null }) {
  // Values are inserted as plain text; `renderEmail` HTML-escapes everything it prints.
  const subject = renderTemplate(action.subject, ctx).replace(/[\r\n]+/g, " ").slice(0, 200);
  const paragraphs = renderTemplate(action.body, ctx)
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const { html, text } = renderEmail({ brand: opts.brand, heading: subject, paragraphs, action: opts.link ? { label: "Open", url: opts.link } : undefined, footnote: `Sent by an automation in ${opts.brand}.` });
  return { to: renderTemplate(action.to, ctx).trim(), subject, html, text };
}

interface ActionResult {
  action: string;
  ok: boolean;
  detail: string;
}

async function runAction(action: WorkflowAction, wf: Pick<WorkflowDoc, "_id" | "name" | "secret">, event: RunnableEvent, env: { brand: string; origin: string | null; test: boolean }): Promise<ActionResult> {
  const link = env.origin && event.entity.url ? `${env.origin}${event.entity.url}` : null;
  try {
    if (action.type === "email") {
      const mail = buildWorkflowEmail(action, event.ctx, { brand: env.brand, link });
      if (!isEmailAddress(mail.to)) return { action: "email", ok: false, detail: mail.to ? `"${mail.to.slice(0, 80)}" isn't an email address.` : "No recipient: the field was empty for this event." };
      const sent = await sendEmail({ to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, event: "automation_notification" });
      return sent.ok ? { action: "email", ok: true, detail: `Sent to ${mail.to}` } : { action: "email", ok: false, detail: "The email couldn't be sent." };
    }
    if (action.type === "whatsapp") {
      const to = renderTemplate(action.to, event.ctx).trim();
      if (!isPhoneNumber(to)) return { action: action.type, ok: false, detail: to ? `"${to.slice(0, 40)}" isn't a phone number.` : "No phone number: the field is empty for this event." };
      const text = renderTemplate(action.body, event.ctx).slice(0, 1000);
      const sent = await sendWhatsApp(to, text);
      return sent.ok ? { action: action.type, ok: true, detail: `Sent to ${to}` } : { action: action.type, ok: false, detail: sent.error.slice(0, 200) };
    }
    if (action.type === "notify") {
      const count = await notify({
        to: action.target === "user" ? { userId: action.value } : { role: action.value },
        title: renderTemplate(action.title, event.ctx),
        body: renderTemplate(action.body, event.ctx),
        url: event.entity.url,
      });
      return count > 0 ? { action: "notify", ok: true, detail: `Notified ${count} ${count === 1 ? "person" : "people"}` } : { action: "notify", ok: false, detail: action.target === "user" ? "That person no longer has an account." : "Nobody has that role." };
    }
    const delivery = await deliverWebhook(
      action.url,
      { id: event.id, type: event.type, test: env.test, occurredAt: event.at.toISOString(), workflow: { id: wf._id, name: wf.name }, entity: { ...event.entity, link }, data: event.ctx },
      { secret: wf.secret, eventType: event.type, deliveryId: randomUUID() },
    );
    return delivery.ok ? { action: "webhook", ok: true, detail: `Delivered (${delivery.status})` } : { action: "webhook", ok: false, detail: delivery.error ?? "Delivery failed." };
  } catch (err) {
    console.error(`[workflows] ${action.type} action failed`, err);
    return { action: action.type, ok: false, detail: "Unexpected error." };
  }
}

/** Runs one workflow's actions for an event and logs the run. Conditions are the caller's job. */
export async function executeWorkflow(wf: WorkflowDoc, event: RunnableEvent, opts: { test?: boolean } = {}): Promise<{ status: "success" | "failed"; results: ActionResult[] }> {
  const companyId = await currentCompanyId();
  const [company, origin] = await Promise.all([getCompany(companyId).catch(() => null), appUrlForCompany(companyId).catch(() => null)]);
  const env = { brand: company?.name ?? "Your workspace", origin, test: opts.test === true };

  // Loop guard: anything an action emits is recorded but can't trigger workflows again.
  const results = await runInWorkflowScope(async () => {
    const out: ActionResult[] = [];
    for (const action of wf.actions) out.push(await runAction(action, wf, event, env));
    return out;
  });

  const failed = results.filter((r) => !r.ok);
  const status = failed.length === 0 ? "success" : "failed";
  const error = failed.length ? failed.map((f) => `${f.action}: ${f.detail}`).join("; ").slice(0, 500) : null;
  const at = new Date();
  const { workflows, runs } = await workflowCollections();
  await runs.insertOne({ _id: randomUUID(), workflowId: wf._id, eventId: event.id, eventType: event.type, label: event.entity.label, status, error, results, test: env.test, at });
  await workflows.updateOne({ _id: wf._id }, { $set: { lastRun: { status, at, error } } });
  // Tell the admins once when an automation starts failing (not on every failed run, and never for a test).
  if (status === "failed" && !env.test && wf.lastRun?.status !== "failed") await workspaceEvents.automationFailed(wf.name, wf._id, error ?? "An action failed.");
  return { status, results };
}

/** Every enabled workflow of the current company triggered by this event whose conditions all match. */
export async function runWorkflowsForEvent(event: PlatformEvent): Promise<number> {
  try {
    const { workflows } = await workflowCollections();
    const candidates = await workflows.find({ trigger: event.type, enabled: true }).toArray();
    if (candidates.length === 0) return 0;
    const ctx = await buildContext(event);
    const runnable: RunnableEvent = { id: String(event._id), type: event.type, at: event.at, entity: event.entity, ctx };
    let ran = 0;
    for (const wf of candidates) {
      if (!matchesAll(wf.conditions, ctx)) continue;
      try {
        await executeWorkflow(wf, runnable);
        ran++;
      } catch (err) {
        console.error(`[workflows] workflow ${wf._id} failed`, err);
      }
    }
    return ran;
  } catch (err) {
    console.error("[workflows] run failed", err);
    return 0;
  }
}

/** "Send test": runs the workflow's actions once with the trigger's sample payload (conditions are skipped). */
export async function sendTestRun(workflowId: string, actor: { id: string; email: string }): Promise<{ ok: boolean; error?: string; results?: ActionResult[] }> {
  const { workflows } = await workflowCollections();
  const wf = await workflows.findOne({ _id: workflowId });
  if (!wf) return { ok: false, error: "That automation no longer exists." };
  const def = eventDef(wf.trigger);
  const ctx: EventContext = { ...(def?.sample ?? {}), label: `Sample ${eventLabel(wf.trigger).toLowerCase()}`, url: "/commandos", actorEmail: actor.email, source: "test" };
  const run = await executeWorkflow(wf, { id: null, type: wf.trigger, at: new Date(), entity: { type: "sample", id: "sample", label: String(ctx.label), url: "/commandos" }, ctx }, { test: true });
  return { ok: run.status === "success", results: run.results, error: run.status === "failed" ? run.results.filter((r) => !r.ok).map((r) => r.detail).join(" ") : undefined };
}
