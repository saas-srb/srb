import "server-only";
import { getDb } from "@/lib/mongodb";
import { resolveEmailConfig } from "@/lib/platform/integrations/resolve";
import { resolvedRootDomain } from "@/lib/platform/integrations/store";
import { checkSenderInput, formatFrom, type SenderInput } from "@/lib/platform/email/sender-rules";
import { currentCompanyId, currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANY_DOMAINS_COLLECTION, type CompanyDomain } from "@/lib/platform/tenancy/companies";
import { rootDomainFromHost } from "@/lib/platform/tenancy/root-domain";

/**
 * A company's own sending address (`Acme Care <hello@acme.com>`). Each business connects a domain it owns; the platform's email provider
 * (Resend) checks the DNS records the owner publishes (SPF + DKIM), and once they pass, every email the workspace sends for that company
 * (sign-in codes, invitations, invoices, automations …) goes out from that address. Until then, and if the domain later stops verifying,
 * mail keeps going from the platform's own sender so nothing is lost.
 *
 * A domain belongs to ONE company (`email_sender_domains`, platform-wide), because the provider account is shared: without that, one
 * company could send as another's domain. Every function acts for the CURRENT company only.
 */

export type SenderStatus = "pending" | "verified" | "failed";

export interface SenderRecord {
  kind: string;
  type: string;
  name: string;
  value: string;
  priority: number | null;
  status: string;
}

interface SenderDoc extends SenderInput {
  _id: string;
  resendDomainId: string;
  status: SenderStatus;
  records: SenderRecord[];
  verifiedAt: Date | null;
  checkedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SenderView extends SenderInput {
  status: SenderStatus;
  records: SenderRecord[];
  from: string;
  verifiedAt: string | null;
  checkedAt: string | null;
}

export type SenderResult<T = null> = { ok: true; value: T } | { ok: false; error: string };

const COLLECTION = "email_sender";
const CLAIMS = "email_sender_domains";
/** A claim that never got verified stops blocking others after this long. */
const STALE_CLAIM_MS = 7 * 24 * 60 * 60 * 1000;

interface Claim { _id: string; companyId: string; verified: boolean; createdAt: Date }

async function col() {
  return (await getDb()).collection<SenderDoc>(COLLECTION);
}
async function claims() {
  return (await getPlatformDb()).collection<Claim>(CLAIMS);
}

// ── The email provider's domain API ────────────────────────────────────────────

interface ResendRecord { record?: string; name?: string; type?: string; value?: string; priority?: number; status?: string }
interface ResendDomain { id?: string; name?: string; status?: string; records?: ResendRecord[]; message?: string }

async function resend<T = ResendDomain>(method: string, path: string, body?: unknown): Promise<SenderResult<T>> {
  const cfg = await resolveEmailConfig();
  if (cfg.provider !== "resend" || !cfg.resendApiKey) return { ok: false, error: "Sending from your own domain is not available right now. Please contact support." };
  try {
    const res = await fetch(`https://api.resend.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.resendApiKey}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) return { ok: false, error: json.message || `The email service answered ${res.status}.` };
    return { ok: true, value: json };
  } catch {
    return { ok: false, error: "Could not reach the email service. Please try again." };
  }
}

function status(raw: string | undefined): SenderStatus {
  if (raw === "verified") return "verified";
  if (raw === "failed") return "failed";
  return "pending";
}
const toRecords = (r: ResendRecord[] | undefined): SenderRecord[] =>
  (r ?? [])
    .filter((x) => x.type && x.name && x.value && x.record !== "Receiving")
    .map((x) => ({ kind: x.record ?? "", type: x.type!, name: x.name!, value: x.value!, priority: typeof x.priority === "number" ? x.priority : null, status: x.status ?? "not_started" }));

// ── Reading ────────────────────────────────────────────────────────────────────

const view = (d: SenderDoc): SenderView => ({
  domain: d.domain,
  localPart: d.localPart,
  fromName: d.fromName,
  replyTo: d.replyTo,
  status: d.status,
  records: d.records,
  from: formatFrom(d),
  verifiedAt: d.verifiedAt?.toISOString() ?? null,
  checkedAt: d.checkedAt?.toISOString() ?? null,
});

export async function getCompanySender(): Promise<SenderView | null> {
  const d = await (await col()).findOne({ _id: "main" });
  return d ? view(d) : null;
}

/**
 * The domain to offer when none is connected yet: the company's own custom domain from Settings → Domains (verified ones first, the
 * primary one before the rest), reduced to the domain mail is sent from (`www.acme.com` → `acme.com`). Null when it has none.
 */
export async function suggestedSenderDomain(): Promise<{ domain: string; host: string } | null> {
  try {
    const companyId = await currentCompanyId();
    const rows = await (await getPlatformDb()).collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION).find({ companyId, kind: "custom" }).toArray();
    rows.sort((a, b) => Number(b.status === "verified") - Number(a.status === "verified") || Number(b.isPrimary) - Number(a.isPrimary));
    for (const r of rows) {
      const domain = rootDomainFromHost(r._id);
      if (domain && checkSenderInput({ domain, localPart: "hello", fromName: "x", replyTo: "" }, resolvedRootDomain()).ok) return { domain, host: r._id };
    }
  } catch {
    /* a suggestion only */
  }
  return null;
}

// ── Changing ───────────────────────────────────────────────────────────────────

/** Connects a domain (or changes the name / address of one already connected). */
export async function saveCompanySender(raw: Partial<SenderInput>): Promise<SenderResult<SenderView>> {
  const checked = checkSenderInput(raw, resolvedRootDomain());
  if (!checked.ok) return checked;
  const input = checked.value;
  const companyId = await currentCompanyId();
  const sender = await col();
  const current = await sender.findOne({ _id: "main" });
  const now = new Date();

  // Same domain: only the name / address / reply-to change; nothing to redo at the provider.
  if (current && current.domain === input.domain) {
    await sender.updateOne({ _id: "main" }, { $set: { localPart: input.localPart, fromName: input.fromName, replyTo: input.replyTo, updatedAt: now } });
    forgetCompanySender(companyId);
    return { ok: true, value: view({ ...current, ...input })};
  }

  // A domain belongs to one business.
  const claim = await (await claims()).findOne({ _id: input.domain });
  if (claim && claim.companyId !== companyId && (claim.verified || now.getTime() - claim.createdAt.getTime() < STALE_CLAIM_MS)) {
    return { ok: false, error: "This domain is already connected by another business. If it is yours, contact support." };
  }

  if (current) await dropAtProvider(current, companyId);
  const created = await resend("POST", "/domains", { name: input.domain });
  if (!created.ok || !created.value.id) {
    return { ok: false, error: created.ok ? "The email service did not accept this domain." : created.error };
  }
  await (await claims()).updateOne({ _id: input.domain }, { $set: { companyId, verified: false, createdAt: now } }, { upsert: true });
  const doc: SenderDoc = {
    _id: "main",
    ...input,
    resendDomainId: created.value.id,
    status: status(created.value.status),
    records: toRecords(created.value.records),
    verifiedAt: null,
    checkedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await sender.replaceOne({ _id: "main" }, doc, { upsert: true });
  forgetCompanySender(companyId);
  return { ok: true, value: view(doc) };
}

/** Asks the provider to check the DNS records now, and stores what it found. */
export async function checkCompanySender(): Promise<SenderResult<SenderView>> {
  const companyId = await currentCompanyId();
  const sender = await col();
  const d = await sender.findOne({ _id: "main" });
  if (!d) return { ok: false, error: "No domain is connected yet." };
  if (d.status !== "verified") await resend("POST", `/domains/${encodeURIComponent(d.resendDomainId)}/verify`);
  const got = await resend("GET", `/domains/${encodeURIComponent(d.resendDomainId)}`);
  if (!got.ok) return got;
  const next = status(got.value.status);
  const now = new Date();
  const patch = { status: next, records: toRecords(got.value.records), checkedAt: now, updatedAt: now, verifiedAt: next === "verified" ? d.verifiedAt ?? now : null };
  await sender.updateOne({ _id: "main" }, { $set: patch });
  await (await claims()).updateOne({ _id: d.domain, companyId }, { $set: { verified: next === "verified" } });
  forgetCompanySender(companyId);
  return { ok: true, value: view({ ...d, ...patch }) };
}

export async function removeCompanySender(): Promise<SenderResult> {
  const companyId = await currentCompanyId();
  const sender = await col();
  const d = await sender.findOne({ _id: "main" });
  if (!d) return { ok: true, value: null };
  await dropAtProvider(d, companyId);
  await sender.deleteOne({ _id: "main" });
  forgetCompanySender(companyId);
  return { ok: true, value: null };
}

async function dropAtProvider(d: SenderDoc, companyId: string) {
  await resend("DELETE", `/domains/${encodeURIComponent(d.resendDomainId)}`).catch(() => {});
  await (await claims()).deleteOne({ _id: d.domain, companyId });
}

// ── Using it when mail goes out ────────────────────────────────────────────────

const cache = new Map<string, { at: number; value: { from: string; replyTo?: string } | null }>();
const TTL_MS = 60_000;

export function forgetCompanySender(companyId: string) {
  cache.delete(companyId);
}

/** The sender for the current company's mail, or null when it has none that is verified (the platform's sender is used then). */
export async function companySenderForSending(): Promise<{ from: string; replyTo?: string } | null> {
  try {
    const companyId = await currentCompanyIdOrNull();
    if (!companyId) return null;
    const hit = cache.get(companyId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const d = await (await col()).findOne({ _id: "main" });
    const value = d && d.status === "verified" ? { from: formatFrom(d), ...(d.replyTo ? { replyTo: d.replyTo } : {}) } : null;
    if (cache.size > 2000) cache.clear();
    cache.set(companyId, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

/** The company's reply-to address even when its own domain is not verified yet (replies still reach the business). */
export async function companyReplyTo(): Promise<string | undefined> {
  try {
    return (await (await col()).findOne({ _id: "main" }))?.replyTo || undefined;
  } catch {
    return undefined;
  }
}

/** Called when the provider refuses mail from the company's domain: it is marked as not verified until it is checked again. */
export async function markSenderFailing(): Promise<void> {
  try {
    const companyId = await currentCompanyIdOrNull();
    if (!companyId) return;
    await (await col()).updateOne({ _id: "main", status: "verified" }, { $set: { status: "failed", updatedAt: new Date() } });
    forgetCompanySender(companyId);
  } catch {
    /* never fails a send */
  }
}
