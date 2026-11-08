export interface EmailMessage {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text alternative; always provide one for deliverability. */
  text: string;
  replyTo?: string;
  /** A calendar invitation (iCalendar text with METHOD:REQUEST or METHOD:CANCEL). Mail clients show it as an invitation they can accept. */
  calendar?: { method: "REQUEST" | "CANCEL"; ics: string };
}

/** Which Notification-center event an email belongs to (and, for platform mail, which company it is for), so it is logged and can be switched off. */
export interface EmailEvent {
  event: string;
  companyId?: string;
}

export type EmailResult = { ok: true; id: string | null } | { ok: false; error: string };

export interface EmailProvider {
  id: string;
  send(message: EmailMessage): Promise<EmailResult>;
}
