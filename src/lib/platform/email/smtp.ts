import nodemailer from "nodemailer";
import type { EmailProvider } from "@/lib/platform/email/types";

/** A workspace's own SMTP server (Workspace → Settings → Integrations → SMTP). */
export function createSmtpEmailProvider(v: Record<string, string>): EmailProvider {
  const transporter = nodemailer.createTransport({
    host: v.host,
    port: Number(v.port) || 587,
    secure: v.secure === "ssl",
    requireTLS: v.secure === "starttls",
    ignoreTLS: v.secure === "none",
    auth: v.username ? { user: v.username, pass: v.password } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return {
    id: "smtp",
    async send(message) {
      try {
        const info = await transporter.sendMail({
          from: message.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          ...(message.calendar ? { icalEvent: { method: message.calendar.method, filename: "invite.ics", content: message.calendar.ics } } : {}),
        });
        return { ok: true, id: info.messageId ?? null };
      } catch (err) {
        return { ok: false, error: `SMTP: ${err instanceof Error ? err.message : "send failed"}` };
      }
    },
  };
}
