import { workspaceEvents } from "@/lib/notify/triggers/workspace";
import "server-only";
import { domainBlockReason } from "@/lib/platform/billing/enforce";
import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { domainToASCII } from "node:url";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId, forEachCompany } from "@/lib/platform/tenancy/context";
import { COMPANY_DOMAINS_COLLECTION, forgetCompanyRouting, isPlatformHost, normalizeHost, type CompanyDomain } from "@/lib/platform/tenancy/companies";
import { syncAtProvider } from "@/lib/platform/tenancy/provisioning";
import { activeDomainProvider } from "@/lib/platform/domains";
import { routingRecord } from "@/lib/platform/domains/vercel";
import type { DnsHistoryEntry, CompanyDomainView, DnsRecord, DomainActionResult, RecordState } from "@/lib/platform/domains/types";
import { forgetCompanySiteUrls } from "@/lib/platform/tenancy/site-url";

/**
 * A company's own domains (`www.acme.com`), managed by its Director from
 * Settings → Domains. Every function acts for the CURRENT company only.
 *
 * Lifecycle: added → `pending` → the owner proves control of the DNS zone by
 * publishing a TXT record → `verified`, which is what routing honours (see
 * `resolveCompanyIdByHost`). Separately the host is attached at the hosting
 * provider, which serves it and issues TLS once its routing record is in place.
 */

export const MAX_CUSTOM_DOMAINS = 10;
/** Owner-published proof of control: `_domain-verify.<host>` TXT = `domain-verify=<token>`. */
export const VERIFY_LABEL = "_domain-verify";
const VERIFY_PREFIX = "domain-verify=";
/**
 * A pending claim another company never verified stops blocking the address
 * after this long — otherwise anyone could squat a domain by adding it first.
 */
const STALE_CLAIM_MS = 7 * 24 * 60 * 60 * 1000;
const TAKEN = "That domain is already connected to a workspace.";

/** Resolves a name's TXT records (chunks per record), like `dns.promises.resolveTxt`. Injectable for tests. */
export type TxtResolver = (name: string) => Promise<string[][]>;

async function domainsCollection() {
  return (await getPlatformDb()).collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION);
}

// ─── Validation ─────────────────────────────────────────────────────────────

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Turns what the owner typed (`https://Shop.Acme.com/`, `münchen.de`) into a
 * bare ASCII hostname, or explains why it can't be one of their domains.
 */
export function parseCustomDomain(raw: string): { ok: true; host: string } | { ok: false; error: string } {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: false, error: "Enter a domain, like www.yourcompany.com." };
  // Internationalised names are stored in their ASCII (punycode) form, as DNS sees them.
  const stripped = trimmed.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0];
  const ascii = domainToASCII(stripped.replace(/:\d+$/, "")) || stripped;
  const host = normalizeHost(ascii);
  if (!host || host.length > 253) return { ok: false, error: "That doesn't look like a domain name." };
  if (/^[\d.]+$/.test(host)) return { ok: false, error: "Enter a domain name, not an IP address." };
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".vercel.app")) {
    return { ok: false, error: "Use a domain you own and can publish DNS records for." };
  }
  const labels = host.split(".");
  if (labels.length < 2) return { ok: false, error: "Enter a full domain including its ending, like yourcompany.com." };
  if (!labels.every((l) => LABEL_RE.test(l))) return { ok: false, error: "That doesn't look like a domain name." };
  if (!TLD_RE.test(labels[labels.length - 1])) return { ok: false, error: "That domain ending isn't valid." };
  if (labels[0] === "app") return { ok: false, error: "Add your main domain (like yourcompany.com). The app. address for your products is set up for you." };
  if (isPlatformHost(host)) return { ok: false, error: "Platform addresses can't be added. Your workspace address is already connected." };
  return { ok: true, host };
}

/** The same site with / without `www.` — routing treats them as one (see `lookupHost`). */
function wwwCounterpart(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : `www.${host}`;
}

/** Where a custom domain's products live: `app.<domain>` (the domain itself serves only the website). */
export function appHostOf(host: string): string {
  return `app.${host.replace(/^www\./, "")}`;
}

/**
 * Attaches / re-checks the app host `app.<domain>` at the hosting provider and keeps its state on the domain's own document
 * (it has no document of its own), so the Domains page can show its ownership challenge and routing records next to the website's.
 */
async function syncAppHost(domainHost: string, op: "add" | "status" | "verify") {
  return syncAtProvider(appHostOf(domainHost), op, { docId: domainHost, field: "appProvider" });
}

// ─── View ───────────────────────────────────────────────────────────────────

export function verificationRecord(d: Pick<CompanyDomain, "_id" | "verificationToken">): DnsRecord {
  return { type: "TXT", name: `${VERIFY_LABEL}.${d._id}`, value: `${VERIFY_PREFIX}${d.verificationToken}`, reason: "Proves you own the domain" };
}

const TXT_STATE: Record<NonNullable<CompanyDomain["lastCheck"]>["txt"], RecordState> = { found: "ok", missing: "missing", mismatch: "mismatch", error: "unknown" };

function sameRecord(a: DnsRecord, b: DnsRecord): boolean {
  return a.type === b.type && a.name === b.name && a.value === b.value;
}

/** The client-safe view of one domain record (also used by the Platform Console overview). */
export function toView(d: CompanyDomain): CompanyDomainView {
  const kind = d.kind ?? "custom";
  const p = d.provider;
  const localOnly = d._id.endsWith(".localhost");
  const records: CompanyDomainView["records"] = [];

  if (kind === "custom") {
    if (d.status === "pending") records.push({ ...verificationRecord(d), state: d.lastCheck ? TXT_STATE[d.lastCheck.txt] : "unknown" });
    if (p && p.id !== "manual") {
      // The provider's own list is authoritative: its ownership challenge and/or the routing record.
      for (const r of p.records ?? []) if (!records.some((x) => sameRecord(x, r))) records.push({ ...r, state: "missing" });
      if (!p.dnsConfigured && !records.some((r) => r.type !== "TXT")) records.push({ ...routingRecord(d._id), state: "missing" });
    } else if (d.status === "pending") {
      // Manual hosting can't tell whether DNS is in place; show the standard record.
      records.push({ ...routingRecord(d._id), state: "unknown" });
    }
  }

  // The app host `app.<domain>` is a second host at the hosting provider: it can demand its own ownership proof and needs its own
  // routing record. Its records are listed with the website's so everything is published in one go.
  let app: CompanyDomainView["app"] = null;
  if (kind === "custom" && !localOnly) {
    const ap = d.appProvider;
    const appHost = appHostOf(d._id);
    const add = (r: DnsRecord, state: RecordState) => {
      if (!records.some((x) => sameRecord(x, r))) records.push({ ...r, state });
    };
    if (ap && ap.id !== "manual") {
      for (const r of ap.records ?? []) add({ ...r, reason: r.type === "TXT" ? `Proves you can serve ${appHost} (hosting provider)` : `Serves your products at ${appHost}` }, "missing");
      if (!ap.dnsConfigured && !(ap.records ?? []).some((r) => r.type !== "TXT")) add({ ...routingRecord(appHost), reason: `Serves your products (Workspace and the rest) at ${appHost}` }, "missing");
    } else {
      add({ ...routingRecord(appHost), reason: `Serves your products (Workspace and the rest) at ${appHost}` }, "unknown");
    }
    const appSsl: NonNullable<CompanyDomainView["app"]>["ssl"] = ap?.id === "manual" ? "manual" : ap?.error ? "error" : ap?.attached && ap.verified && ap.dnsConfigured ? "active" : "pending";
    app = { host: appHost, ssl: appSsl, verified: Boolean(ap?.verified), dnsConfigured: Boolean(ap?.dnsConfigured), error: ap?.error ?? null };
  }

  // Everything this domain has needed, so a record that disappeared from the list above once published can still be looked up.
  const history: CompanyDomainView["history"] = [];
  const remember = (host: string, r: DnsRecord, seenAt: Date | null) => {
    if (history.some((x) => sameRecord(x, r))) return;
    // A record counts as connected when the host it belongs to is in the state that record exists to achieve: ownership proof (TXT)
    // → verified, routing (A / CNAME) → DNS pointing at the hosting platform.
    const hp = host === d._id ? d.provider : d.appProvider;
    const verifiedHere = host === d._id ? d.status === "verified" || Boolean(hp?.verified) : Boolean(hp?.verified);
    const state: DnsHistoryEntry["state"] = !hp || hp.id === "manual" ? "unchecked" : (r.type === "TXT" ? verifiedHere : hp.dnsConfigured) ? "connected" : "not-connected";
    history.push({ ...r, host, seenAt: seenAt ? seenAt.toISOString() : null, state });
  };
  if (kind === "custom" && !localOnly) {
    for (const e of [...(d.dnsLog ?? [])].sort((a, b) => b.seenAt.getTime() - a.seenAt.getTime())) remember(e.host, e, e.seenAt);
    remember(d._id, verificationRecord(d), null);
    remember(d._id, routingRecord(d._id), null);
    remember(appHostOf(d._id), { ...routingRecord(appHostOf(d._id)), reason: "Serves your products (Workspace and the rest)" }, null);
  }

  let ssl: CompanyDomainView["hosting"]["ssl"];
  if (localOnly || p?.id === "manual") ssl = "manual";
  else if (p?.error) ssl = "error";
  else if (p?.attached && p.verified && p.dnsConfigured) ssl = "active";
  else ssl = "pending";

  return {
    host: d._id,
    kind,
    status: d.status,
    isPrimary: d.isPrimary,
    removable: d.kind === "custom" && !isPlatformHost(d._id),
    createdAt: d.createdAt.toISOString(),
    verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null,
    records,
    hosting: { providerId: localOnly ? null : (p?.id ?? null), dnsConfigured: Boolean(p?.dnsConfigured), ssl, error: p?.error ?? null },
    lastCheckedAt: (d.lastCheck?.at ?? p?.checkedAt)?.toISOString() ?? null,
    history,
    app,
  };
}

/** All of the current company's domains — the automatic address first, then primary, then oldest. */
export async function listCompanyDomains(): Promise<CompanyDomainView[]> {
  const companyId = await currentCompanyId();
  const domains = await domainsCollection();
  let rows = await domains.find({ companyId }).toArray();
  // A verified domain's app host (`app.<domain>`) is attached and checked at the hosting provider on its own: whenever it has never
  // been looked at, or is still waiting (ownership proof, DNS), fetch its state now so the records to publish are listed without
  // anyone having to press a button. Throttled, so reopening the page doesn't hammer the provider.
  const stale = rows.filter((d) => {
    if (d.kind !== "custom" || d.status !== "verified" || d._id.endsWith(".localhost")) return false;
    const ap = d.appProvider;
    if (!ap) return true;
    if (ap.id === "manual" || ap.id === "wildcard" || (ap.attached && ap.verified && ap.dnsConfigured)) return false;
    return Date.now() - ap.checkedAt.getTime() > 60_000;
  });
  if (stale.length) {
    await Promise.all(stale.map((d) => syncAppHost(d._id, d.appProvider?.attached ? (d.appProvider.verified ? "status" : "verify") : "add").catch(() => null)));
    rows = await domains.find({ companyId }).toArray();
  }
  const rank = (d: CompanyDomain) => (d.kind === "subdomain" ? 0 : d.isPrimary ? 1 : 2);
  rows.sort((a, b) => rank(a) - rank(b) || a.createdAt.getTime() - b.createdAt.getTime());
  return rows.map(toView);
}

async function ok(message?: string): Promise<DomainActionResult> {
  return { ok: true, domains: await listCompanyDomains(), message };
}

// ─── Add ────────────────────────────────────────────────────────────────────

export async function addCustomDomain(raw: string): Promise<DomainActionResult> {
  const parsed = parseCustomDomain(raw);
  if (!parsed.ok) return parsed;
  const { host } = parsed;
  const companyId = await currentCompanyId();
  const domains = await domainsCollection();

  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
  const isStaleClaim = (d: CompanyDomain) => d.companyId !== companyId && d.status === "pending" && d.kind === "custom" && d.createdAt < staleBefore;
  for (const existing of await domains.find({ _id: { $in: [host, wwwCounterpart(host)] } }).toArray()) {
    if (existing._id === host && existing.companyId === companyId) return { ok: false, error: "You've already added that domain." };
    if (existing.companyId !== companyId && !isStaleClaim(existing)) return { ok: false, error: TAKEN };
  }

  const connected = await domains.countDocuments({ companyId, kind: "custom" });
  // The plan's (and any bought) custom-domain allowance.
  const planBlock = await domainBlockReason(connected).catch(() => null);
  if (planBlock) return { ok: false, error: planBlock };
  if (connected >= MAX_CUSTOM_DOMAINS) {
    return { ok: false, error: `A workspace can connect up to ${MAX_CUSTOM_DOMAINS} custom domains. Remove one to add another.` };
  }

  // Release another company's abandoned claim on this exact host (re-checked in the filter, so a
  // claim verified meanwhile survives and the insert below reports the conflict).
  await domains.deleteOne({ _id: host, companyId: { $ne: companyId }, status: "pending", kind: "custom", createdAt: { $lt: staleBefore } });

  const now = new Date();
  try {
    await domains.insertOne({ _id: host, companyId, status: "pending", verificationToken: randomBytes(16).toString("hex"), isPrimary: false, kind: "custom", createdAt: now, verifiedAt: null });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { ok: false, error: TAKEN };
    throw err;
  }
  // Non-fatal: the record exists either way, and "Check now" retries the provider.
  const attach = await syncAtProvider(host, "add");
  await syncAppHost(host, "add");
  return ok(attach.error ? `Added ${host}. The hosting provider couldn't attach it yet; we'll retry when you check it.` : `Added ${host}. Publish the DNS records below, then check it.`);
}

// ─── Verify ─────────────────────────────────────────────────────────────────

type TxtOutcome = NonNullable<CompanyDomain["lastCheck"]>;

async function checkTxt(d: CompanyDomain, resolver: TxtResolver): Promise<TxtOutcome> {
  const expected = verificationRecord(d).value;
  const at = new Date();
  try {
    const values = (await resolver(`${VERIFY_LABEL}.${d._id}`)).map((chunks) => chunks.join("").trim());
    if (values.includes(expected)) return { at, txt: "found", detail: null };
    if (values.some((v) => v.startsWith(VERIFY_PREFIX))) return { at, txt: "mismatch", detail: "A verification record exists but its value doesn't match." };
    return { at, txt: "missing", detail: "No verification record found yet." };
  } catch (err) {
    const code = (err as { code?: string }).code;
    // No such name / no TXT at that name: simply not published (or not propagated) yet.
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") return { at, txt: "missing", detail: "No verification record found yet." };
    return { at, txt: "error", detail: `DNS lookup failed (${code ?? "error"}). Try again in a few minutes.` };
  }
}

/**
 * Re-checks one of the current company's domains now: ownership (TXT, or the
 * hosting provider's own challenge when it issued one) for a pending domain,
 * and hosting/SSL state for any domain.
 */
export async function verifyCustomDomain(raw: string, resolver: TxtResolver = resolveTxt): Promise<DomainActionResult> {
  const host = normalizeHost(raw);
  const companyId = await currentCompanyId();
  const domains = await domainsCollection();
  const d = host ? await domains.findOne({ _id: host, companyId }) : null;
  if (!d) return { ok: false, error: "That domain isn't connected to this workspace." };

  if (d.status === "verified") {
    // Ownership is settled; only the hosting side (DNS routing, TLS) can still change.
    // A record that was never attached (provider outage at add time) gets attached now.
    await syncAtProvider(d._id, d.provider?.attached ? "status" : "add");
    await syncAppHost(d._id, d.appProvider?.attached ? (d.appProvider.verified ? "status" : "verify") : "add");
    forgetCompanyRouting();
    forgetCompanySiteUrls();
    return ok(`${d._id} is verified.`);
  }

  const [txt, hosting] = await Promise.all([checkTxt(d, resolver), syncAtProvider(d._id, d.provider?.attached ? "verify" : "add"), syncAppHost(d._id, d.appProvider?.attached ? "verify" : "add")]).then(([t, h]) => [t, h] as const);
  // The provider's "verified" counts as proof only when it had asked for its own
  // TXT challenge: a host no other provider account uses is "verified" there
  // without its owner doing anything, and a manual provider reports everything verified.
  const after = await domains.findOne({ _id: d._id, companyId }, { projection: { provider: 1 } });
  const providerProof = hosting.providerId !== "manual" && hosting.status?.verified === true && after?.provider?.challenged === true;

  const now = new Date();
  if (txt.txt === "found" || providerProof) {
    const res = await domains.updateOne({ _id: d._id, companyId, status: "pending" }, { $set: { status: "verified", verifiedAt: now, lastCheck: txt } });
    forgetCompanyRouting();
    forgetCompanySiteUrls();
    if (res.modifiedCount === 0) return ok(`${d._id} is verified.`);
    await workspaceEvents.domain(d._id, "verified");
    return ok(hosting.status?.dnsConfigured ? `${d._id} is verified and live.` : `${d._id} is verified. Traffic reaches your workspace once the routing record is in place.`);
  }

  await domains.updateOne({ _id: d._id, companyId }, { $set: { lastCheck: txt } });
  return { ok: false, error: `${d._id} isn't verified yet. ${txt.detail ?? ""} DNS changes can take up to an hour to show up.`.replace(/\s+/g, " ").trim() };
}

// ─── Primary / remove ───────────────────────────────────────────────────────

/** The address the workspace is presented under. Exactly one per company; only a verified domain. */
export async function setPrimaryDomain(raw: string): Promise<DomainActionResult> {
  const host = normalizeHost(raw);
  const companyId = await currentCompanyId();
  const domains = await domainsCollection();
  const d = host ? await domains.findOne({ _id: host, companyId }) : null;
  if (!d) return { ok: false, error: "That domain isn't connected to this workspace." };
  if (d.status !== "verified") return { ok: false, error: "Verify the domain before making it primary." };
  await domains.updateOne({ _id: d._id, companyId }, { $set: { isPrimary: true } });
  await domains.updateMany({ companyId, _id: { $ne: d._id }, isPrimary: true }, { $set: { isPrimary: false } });
  // The primary domain is the company's public site URL (sitemap, canonical, links) — apply it now.
  forgetCompanySiteUrls();
  return ok(`${d._id} is now your primary domain.`);
}

export async function removeCustomDomain(raw: string): Promise<DomainActionResult> {
  const host = normalizeHost(raw);
  const companyId = await currentCompanyId();
  const domains = await domainsCollection();
  const d = host ? await domains.findOne({ _id: host, companyId }) : null;
  if (!d) return { ok: false, error: "That domain isn't connected to this workspace." };
  // Only domains added here: the automatic address, and platform/operator-attached ones, stay.
  if (d.kind !== "custom" || isPlatformHost(d._id)) return { ok: false, error: "Your workspace's own address can't be removed." };

  const res = await domains.deleteOne({ _id: d._id, companyId, kind: "custom" });
  if (res.deletedCount === 0) return ok();
  if (d.isPrimary) {
    // Fall back to the automatic address (or, lacking one, the oldest verified domain).
    const fallback =
      (await domains.findOne({ companyId, kind: "subdomain" })) ?? (await domains.find({ companyId, status: "verified" }).sort({ createdAt: 1 }).limit(1).next());
    if (fallback) await domains.updateOne({ _id: fallback._id, companyId }, { $set: { isPrimary: true } });
  }
  forgetCompanyRouting();
  forgetCompanySiteUrls();

  try {
    const provider = await activeDomainProvider();
    for (const h of [d._id, appHostOf(d._id)]) {
      const detached = await provider.remove(h);
      if (!detached.ok) console.error(`[domains] detaching ${h} failed`, detached.error);
    }
  } catch (err) {
    console.error(`[domains] detaching ${d._id} failed`, err);
  }
  return ok(`Removed ${d._id}.`);
}

// ─── Background re-check ────────────────────────────────────────────────────

/**
 * Daily cron: re-checks every company's pending custom domains (so a domain
 * verifies even if the owner never presses "Check now") and refreshes the
 * hosting state of verified ones whose DNS isn't in place yet.
 */
export async function recheckPendingDomains(resolver: TxtResolver = resolveTxt) {
  return forEachCompany(async (companyId) => {
    const domains = await domainsCollection();
    const due = await domains
      .find({ companyId, kind: "custom", $or: [{ status: "pending" }, { "provider.dnsConfigured": { $ne: true } }, { "appProvider.dnsConfigured": { $ne: true } }, { "appProvider.verified": { $ne: true } }] }, { projection: { _id: 1, status: 1 } })
      .toArray();
    let verified = 0;
    for (const d of due) {
      const res = await verifyCustomDomain(d._id, resolver);
      if (d.status === "pending" && res.ok) verified++;
    }
    return { checked: due.length, verified };
  });
}
