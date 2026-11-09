import type { EmailProvider } from "@/lib/platform/email/types";

/** SendGrid's v3 mail API, with the workspace's own key (Workspace → Settings → Integrations → SendGrid). */
export function createSendgridEmailProvider(apiKey: string): EmailProvider {
  return {
    id: "sendgrid",
    async send(message) {
      const to = (Array.isArray(message.to) ? message.to : [message.to]).map((email) => ({ email }));
      const fromMatch = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(message.from);
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to }],
          from: fromMatch ? { email: fromMatch[2], ...(fromMatch[1] ? { name: fromMatch[1].replace(/^"|"$/g, "") } : {}) } : { email: message.from },
          ...(message.replyTo ? { reply_to: { email: message.replyTo } } : {}),
          subject: message.subject,
          content: [
            ...(message.text ? [{ type: "text/plain", value: message.text }] : []),
            { type: "text/html", value: message.html },
            ...(message.calendar ? [{ type: `text/calendar; method=${message.calendar.method}; charset=UTF-8`, value: message.calendar.ics }] : []),
          ],
          ...(message.calendar || message.files?.length
            ? { attachments: [
                ...(message.calendar ? [{ content: Buffer.from(message.calendar.ics, "utf8").toString("base64"), type: "application/ics", filename: "invite.ics", disposition: "attachment" }] : []),
                ...(message.files ?? []).map((f) => ({ content: f.content.toString("base64"), type: f.contentType, filename: f.filename, disposition: "attachment" })),
              ] }
            : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[] };
        return { ok: false, error: `SendGrid ${res.status}: ${body.errors?.[0]?.message ?? "request failed"}` };
      }
      return { ok: true, id: res.headers.get("x-message-id") };
    },
  };
}
