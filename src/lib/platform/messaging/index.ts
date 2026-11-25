import "server-only";
import { resolveConnection } from "@/lib/platform/connections/resolve";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { WHATSAPP_NEEDS_SENDER } from "@/lib/platform/messaging/sender-copy";

export { WHATSAPP_NEEDS_SENDER };

/**
 * Company-written WhatsApp (automations, manual sends, campaigns) goes only through the COMPANY'S OWN sender (Workspace → Settings →
 * Integrations): Twilio's WhatsApp sender, or Meta's WhatsApp Business Cloud API. The platform's Twilio WhatsApp sender is never used for it:
 * WhatsApp makes the sending business responsible for its templates and opt-in, so that sender is only for the platform's own approved
 * messages (there are none today). The platform operator's own workspace is that business, so for it the platform keys are its own.
 * Never throws — failures come back in the result; `skipped` means nothing was attempted because there is no sender.
 */
export type MessageResult = { ok: true; id: string | null } | { ok: false; error: string; skipped?: true };

export type WhatsAppSender = { via: "twilio" | "whatsapp-cloud"; values: Record<string, string> };

/** The sender this company may use for its own messages, or null. THE one place that decides it. */
export async function companyWhatsAppSender(): Promise<WhatsAppSender | null> {
  const twilio = await resolveConnection("twilio");
  const t = twilio && (twilio.source === "workspace" || (await isPlatformOwnerContext())) ? twilio.values : null;
  if (t?.accountSid && t.authToken && t.whatsappFrom) return { via: "twilio", values: t };
  const cloud = await resolveConnection("whatsapp-cloud");
  const c = cloud?.values;
  return c?.phoneNumberId && c.accessToken ? { via: "whatsapp-cloud", values: c } : null;
}

/** The note on a company's Twilio card and panel while it has no WhatsApp sender of its own. */
export async function whatsAppSenderNotice(provider: string): Promise<string | null> {
  if (provider !== "twilio" || (await companyWhatsAppSender())) return null;
  return "To send WhatsApp messages, add your WhatsApp sender (your own account).";
}

const PHONE_RE = /^\+?[0-9][0-9 ()-]{6,18}$/;
export const isPhoneNumber = (v: string) => PHONE_RE.test(v.trim());
const digits = (v: string) => v.replace(/[^\d+]/g, "");
const E164 = (v: string) => (digits(v).startsWith("+") ? digits(v) : `+${digits(v)}`);

async function twilioSend(v: Record<string, string>, form: Record<string, string>): Promise<MessageResult> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(v.accountSid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${v.accountSid}:${v.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  return res.ok ? { ok: true, id: body.sid ?? null } : { ok: false, error: `Twilio ${res.status}: ${body.message ?? "request failed"}` };
}

export async function sendWhatsApp(to: string, body: string): Promise<MessageResult> {
  try {
    if (!isPhoneNumber(to)) return { ok: false, error: "That isn't a phone number." };
    const sender = await companyWhatsAppSender();
    if (!sender) return { ok: false, error: WHATSAPP_NEEDS_SENDER, skipped: true };
    if (sender.via === "twilio") {
      const twilio = sender.values;
      const from = twilio.whatsappFrom.startsWith("whatsapp:") ? twilio.whatsappFrom : `whatsapp:${twilio.whatsappFrom}`;
      const sent = await twilioSend(twilio, { To: `whatsapp:${E164(to)}`, From: from, Body: body.slice(0, 1500) });
      return sent;
    }
    {
      const cloud = sender.values;
      const res = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(cloud.phoneNumberId)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cloud.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: E164(to).replace("+", ""), type: "text", text: { body: body.slice(0, 4000) } }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } };
      return res.ok ? { ok: true, id: data.messages?.[0]?.id ?? null } : { ok: false, error: `WhatsApp ${res.status}: ${data.error?.message ?? "request failed"}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "WhatsApp failed" };
  }
}
