"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import { saveWebPushSettings } from "@/lib/webpush/store";
import { sendBroadcast } from "@/lib/webpush/send";
import { isTopic, type WebPushSettings } from "@/lib/webpush/topics";

type Fail = { ok: false; error: string };

export async function saveWebPushSettingsAction(input: WebPushSettings): Promise<{ ok: true; settings: WebPushSettings } | Fail> {
  const user = await requireWorkspaceAction("manage.push");
  const settings = await saveWebPushSettings(input);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "settings", entity: "settings", entityId: "web-push", entityLabel: "Website push notifications" });
  revalidatePath("/commandos/push");
  return { ok: true, settings };
}

export async function sendWebPushAction(input: { topic: string; title: string; body: string; url: string }): Promise<{ ok: true; sent: number; failed: number; targeted: number; partial: boolean } | Fail> {
  const user = await requireWorkspaceAction("manage.push");
  if (!isTopic(input.topic)) return { ok: false, error: "Choose a topic." };
  const res = await sendBroadcast({ topic: input.topic, title: input.title, body: input.body, url: input.url, trigger: "manual", createdBy: user.id });
  revalidatePath("/commandos/push");
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "settings", entity: "settings", entityId: "web-push-send", entityLabel: `Sent: ${res.broadcast.title}` });
  return { ok: true, sent: res.broadcast.sent, failed: res.broadcast.failed, targeted: res.broadcast.targeted, partial: res.broadcast.status === "partial" };
}
