import "server-only";
import { emailBlockReason } from "@/lib/platform/billing/enforce";
import { recordUsage } from "@/lib/platform/billing/usage";
import { createConsoleEmailProvider } from "@/lib/platform/email/console";
import { createResendEmailProvider } from "@/lib/platform/email/resend";
import { createSendgridEmailProvider } from "@/lib/platform/email/sendgrid";
import { createSmtpEmailProvider } from "@/lib/platform/email/smtp";
import { getSavedConnection } from "@/lib/platform/connections/store";
import { companyReplyTo, companySenderForSending, markSenderFailing } from "@/lib/platform/email/sender";
import type { EmailEvent, EmailMessage, EmailProvider, EmailResult } from "@/lib/platform/email/types";
import { channelState, logDeliveries, maskEmail, offDetail } from "@/lib/notify/center/store";
import { resolveEmailConfig, type ResolvedEmailConfig } from "@/lib/platform/integrations/resolve";
import { currentCompanyIdOrNull, runAsCompany } from "@/lib/platform/tenancy/context";
import { getConfig } from "@/lib/platform/config/store";

export type { EmailMessage, EmailResult } from "@/lib/platform/email/types";

/**
 * Outgoing email, behind a provider chosen at the platform level — never by
 * application code. Configured in Platform Console → Integrations, falling back
 * to `EMAIL_PROVIDER` (`resend` | `console`) / `RESEND_API_KEY` /
 * `EMAIL_FROM`; with nothing set it's Resend when an API key exists, else the
 * console adapter (development: the message is printed, nothing is sent).
 * Adding SES, SendGrid or SMTP means one adapter file and one case below.
 *
 * Server-only: provider credentials never reach the browser.
 */
export async function activeEmailProvider(): Promise<EmailProvider> {
  return providerFor(await resolveEmailConfig());
}

function providerFor(cfg: ResolvedEmailConfig): EmailProvider {
  return cfg.provider === "resend" ? createResendEmailProvider(cfg.resendApiKey) : createConsoleEmailProvider(cfg.explicit);
}

/**
 * A company's own email account (Workspace → Settings → Integrations: SMTP, Resend or SendGrid), if it saved one: its mail then goes out
 * through that account, from its own address, and is not counted against the plan's email allowance. A company that saved none sends
 * through the platform's provider and sender.
 */
async function workspaceEmail(): Promise<{ provider: EmailProvider; from: string } | null> {
  if (!(await currentCompanyIdOrNull())) return null;
  const smtp = await getSavedConnection("smtp");
  if (smtp?.host && smtp.fromEmail) return { provider: createSmtpEmailProvider(smtp), from: smtp.fromName ? `${smtp.fromName} <${smtp.fromEmail}>` : smtp.fromEmail };
  const resend = await getSavedConnection("resend");
  if (resend?.apiKey && resend.from) return { provider: createResendEmailProvider(resend.apiKey), from: resend.from };
  const sendgrid = await getSavedConnection("sendgrid");
  if (sendgrid?.apiKey && sendgrid.from) return { provider: createSendgridEmailProvider(sendgrid.apiKey), from: sendgrid.from };
  return null;
}

/** The platform's default sender, e.g. `SelfRun AI <no-reply@selfrunbusiness.ai>`. */
export async function defaultFrom(): Promise<string> {
  return (await resolveEmailConfig()).from;
}

/**
 * Sends one message. Never throws: a failed send is reported in the result
 * (and logged) so a flaky provider can't break the flow that triggered it —
 * callers decide whether the email was essential.
 */
/** `jane@acme.com` → `acme.com` (the history shows where mail went, not the person's address). */
function emailDomain(to: unknown): string {
  const first = Array.isArray(to) ? to[0] : to;
  const m = typeof first === "string" ? first.match(/@([^>\s,]+)/) : null;
  return m ? m[1].toLowerCase() : "recipient";
}

/**
 * Testing only: with a test inbox saved in Platform Console → Integrations → Email testing (`EMAIL_DEV_TO`), every message goes to that one
 * inbox instead of its real recipient, with the real recipient named in the subject. Needed while the email provider has no verified domain
 * (it then only delivers to the account owner's own address). Nothing saved = mail goes to its real recipients as usual.
 */
async function devRedirect<T extends { to: string | string[]; subject: string }>(message: T): Promise<T> {
  const only = (await getConfig("EMAIL_DEV_TO").catch(() => null))?.trim();
  if (!only) return message;
  const real = (Array.isArray(message.to) ? message.to : [message.to]).join(", ");
  return { ...message, to: only, subject: `[to: ${real}] ${message.subject}` };
}

export async function sendEmail(input: Omit<EmailMessage, "from"> & { from?: string } & Partial<EmailEvent>): Promise<EmailResult> {
  const { event, companyId: forCompany, ...rest } = input;
  if (!event) return deliver(rest);
  // A named event: the company's Notification center can switch it off, and what happened is logged there.
  const scoped = async <T>(fn: () => Promise<T>): Promise<T> => (forCompany && !(await currentCompanyIdOrNull()) ? runAsCompany(forCompany, fn) : fn());
  try {
    const state = await scoped(() => channelState(event, "email"));
    if (!state.on) {
      await scoped(() => logDeliveries([{ channel: "email", event, product: "account", title: rest.subject, status: "off", recipient: maskEmail(String(Array.isArray(rest.to) ? rest.to[0] : rest.to)), detail: offDetail(state.reason) }]));
      return { ok: true, id: null };
    }
  } catch {
    /* a Notification-center problem never stops the email */
  }
  const result = await deliver(rest);
  await scoped(() => logDeliveries([{ channel: "email", event, product: "account", title: rest.subject, status: result.ok ? "sent" : "failed", recipient: maskEmail(String(Array.isArray(rest.to) ? rest.to[0] : rest.to)), detail: result.ok ? "" : result.error }])).catch(() => {});
  return result;
}

async function deliver(input: Omit<EmailMessage, "from"> & { from?: string }): Promise<EmailResult> {
  const message = await devRedirect(input);
  try {
    const own = await workspaceEmail().catch(() => null);
    // A company's own monthly email allowance (never applied to the platform's own mail, which has no company, nor to a company's own account).
    const blocked = own ? null : await emailBlockReason().catch(() => null);
    if (blocked) return { ok: false, error: blocked };
    const cfg = own ? null : await resolveEmailConfig();
    const provider = own ? own.provider : providerFor(cfg!);
    // A company's own verified address wins; otherwise the platform's sender (replies still go to the company's reply-to when it set one).
    const mine = message.from || own || provider.id !== "resend" ? null : await companySenderForSending();
    const replyTo = message.replyTo ?? mine?.replyTo ?? (own ? undefined : await companyReplyTo());
    let result = await provider.send({ ...message, from: message.from ?? own?.from ?? mine?.from ?? cfg!.from, ...(replyTo ? { replyTo } : {}) });
    // The provider no longer accepts the company's domain (DNS changed, domain removed): send from the platform's sender now and mark it for a re-check.
    if (!result.ok && mine && /domain|verif|from/i.test(result.error)) {
      await markSenderFailing();
      result = await provider.send({ ...message, from: cfg!.from, ...(replyTo ? { replyTo } : {}) });
    }
    if (!result.ok) console.error(`[email:${provider.id}] send failed`, result.error);
    else if (!own) await recordUsage("emails", 1, new Date(), { source: "Email sent", detail: `${String(message.subject ?? "").slice(0, 120)}${message.to ? ` → ${emailDomain(message.to)}` : ""}` }).catch(() => {});
    return result;
  } catch (err) {
    console.error("[email] send failed", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
