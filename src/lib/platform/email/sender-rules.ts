import { domainToASCII } from "node:url";

/**
 * What a company may use as its own sending address. Pure (no server imports): the same rules run when it is saved and in the tests.
 * The company enters a domain it controls (`acme.com`), the part before the @ (`hello`), the name people see, and where replies go.
 */

/** Mailbox providers anyone can sign up to: nobody can prove they own them, and they refuse mail sent on someone else's behalf. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com",
  "proton.me", "protonmail.com", "aol.com", "gmx.com", "gmx.net", "mail.com", "yandex.com", "yandex.ru", "rediffmail.com", "mailinator.com",
]);

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LOCAL_RE = /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export interface SenderInput {
  domain: string;
  localPart: string;
  fromName: string;
  replyTo: string;
}

export type SenderCheck = { ok: true; value: SenderInput } | { ok: false; error: string };

/** Cleans and checks what was typed. `platformRoot` is the platform's own domain, which no company can send as. */
export function checkSenderInput(raw: Partial<SenderInput>, platformRoot: string): SenderCheck {
  let domain = String(raw.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].replace(/\.$/, "");
  domain = domainToASCII(domain) || domain;
  if (!DOMAIN_RE.test(domain)) return { ok: false, error: "Enter the domain you own, for example acme.com (no http://, no @)." };
  if (FREE_MAIL.has(domain)) return { ok: false, error: `${domain} is a free mailbox service. Use a domain your business owns.` };
  const root = platformRoot.replace(/:\d+$/, "").toLowerCase();
  if (domain.endsWith(".vercel.app") || domain.endsWith(".localhost") || (root && root !== "localhost" && (domain === root || domain.endsWith(`.${root}`)))) {
    return { ok: false, error: "That domain belongs to the platform. Use your own domain." };
  }
  const localPart = String(raw.localPart ?? "").trim().toLowerCase();
  if (!LOCAL_RE.test(localPart)) return { ok: false, error: "The part before @ can use letters, numbers, dot, dash and underscore, for example hello or no-reply." };
  const fromName = String(raw.fromName ?? "").replace(/\s+/g, " ").trim();
  if (!fromName || fromName.length > 80 || /[<>"\r\n]/.test(fromName)) return { ok: false, error: "Enter the name people will see (up to 80 characters, without < > or quotes)." };
  const replyTo = String(raw.replyTo ?? "").trim().toLowerCase();
  if (replyTo && (replyTo.length > 254 || !EMAIL_RE.test(replyTo))) return { ok: false, error: "The reply-to address is not a valid email address." };
  return { ok: true, value: { domain, localPart, fromName, replyTo } };
}

/** `Acme Care <hello@acme.com>` */
export function formatFrom(s: { fromName: string; localPart: string; domain: string }): string {
  return `${s.fromName} <${s.localPart}@${s.domain}>`;
}
