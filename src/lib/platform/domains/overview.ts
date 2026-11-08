import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { COMPANIES_COLLECTION, COMPANY_DOMAINS_COLLECTION, forgetCompanyRouting, normalizeHost, type Company, type CompanyDomain } from "@/lib/platform/tenancy/companies";
import { syncAtProvider } from "@/lib/platform/tenancy/provisioning";
import { forgetCompanySiteUrls } from "@/lib/platform/tenancy/site-url";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { removeCustomDomain, setPrimaryDomain, toView, verifyCustomDomain } from "@/lib/platform/domains/custom";
import type { CompanyDomainView } from "@/lib/platform/domains/types";

/**
 * Platform Console → Domains & SSL: every company's domains in one list, and
 * the operator actions on them. The actions reuse the per-company functions
 * in `custom.ts` (run inside the owning company's scope) and
 * `syncAtProvider`, so the rules are identical to Settings → Domains. The
 * owning company always comes from the domain record itself, never from the
 * caller. Every action is audited.
 */

export const DOMAINS_PAGE_SIZE = 25;

export interface PlatformDomainRow extends CompanyDomainView {
  companyId: string;
  companyName: string;
  companySlug: string;
  companyStatus: Company["status"] | "missing";
  /** Last ownership check's explanation (custom domains), e.g. "No verification record found yet." */
  dnsDetail: string | null;
}

export type DomainKindFilter = "all" | "subdomain" | "custom";
export type DomainStatusFilter = "all" | "verified" | "pending";
export type DomainSslFilter = "all" | CompanyDomainView["hosting"]["ssl"];

export interface DomainListQuery {
  q?: string;
  kind?: DomainKindFilter;
  status?: DomainStatusFilter;
  ssl?: DomainSslFilter;
  /** Only domains with a provider error, a failed DNS check or outstanding records. */
  issues?: boolean;
  page?: number;
}

export interface DomainList {
  rows: PlatformDomainRow[];
  total: number;
  page: number;
  totalPages: number;
  summary: { total: number; custom: number; pending: number; sslActive: number; errors: number };
}

function hasIssue(r: PlatformDomainRow): boolean {
  return r.hosting.ssl === "error" || r.status === "pending" || r.records.some((x) => x.state !== "ok");
}

export async function listAllDomains(query: DomainListQuery = {}): Promise<DomainList> {
  const db = await getPlatformDb();
  const docs = await db.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION).find({}).limit(20_000).toArray();
  const companyIds = [...new Set(docs.map((d) => d.companyId))];
  const companies = await db
    .collection<Company>(COMPANIES_COLLECTION)
    .find({ _id: { $in: companyIds } }, { projection: { name: 1, slug: 1, status: 1 } })
    .toArray();
  const byId = new Map(companies.map((c) => [c._id, c]));

  const all: PlatformDomainRow[] = docs.map((d) => {
    const c = byId.get(d.companyId);
    return {
      ...toView(d),
      companyId: d.companyId,
      companyName: c?.name ?? "(deleted company)",
      companySlug: c?.slug ?? "",
      companyStatus: c?.status ?? "missing",
      dnsDetail: d.lastCheck?.detail ?? null,
    };
  });
  // Problems first, then newest.
  all.sort((a, b) => Number(hasIssue(b)) - Number(hasIssue(a)) || b.createdAt.localeCompare(a.createdAt));

  const q = query.q?.trim().toLowerCase();
  const filtered = all.filter(
    (r) =>
      (!q || r.host.includes(q) || r.companyName.toLowerCase().includes(q) || r.companySlug.includes(q)) &&
      (!query.kind || query.kind === "all" || r.kind === query.kind) &&
      (!query.status || query.status === "all" || r.status === query.status) &&
      (!query.ssl || query.ssl === "all" || r.hosting.ssl === query.ssl) &&
      (!query.issues || hasIssue(r)),
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / DOMAINS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(query.page ?? 1)), totalPages);
  return {
    rows: filtered.slice((page - 1) * DOMAINS_PAGE_SIZE, page * DOMAINS_PAGE_SIZE),
    total: filtered.length,
    page,
    totalPages,
    summary: {
      total: all.length,
      custom: all.filter((r) => r.kind === "custom").length,
      pending: all.filter((r) => r.status === "pending").length,
      sslActive: all.filter((r) => r.hosting.ssl === "active").length,
      errors: all.filter((r) => r.hosting.ssl === "error").length,
    },
  };
}

/** One company's domains in the same shape (company detail page). */
export async function listDomainsForCompany(companyId: string): Promise<PlatformDomainRow[]> {
  const db = await getPlatformDb();
  const [company, docs] = await Promise.all([
    db.collection<Company>(COMPANIES_COLLECTION).findOne({ _id: companyId }, { projection: { name: 1, slug: 1, status: 1 } }),
    db.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION).find({ companyId }).toArray(),
  ]);
  const rank = (d: CompanyDomain) => (d.kind === "subdomain" ? 0 : d.isPrimary ? 1 : 2);
  docs.sort((a, b) => rank(a) - rank(b) || a.createdAt.getTime() - b.createdAt.getTime());
  return docs.map((d) => ({
    ...toView(d),
    companyId,
    companyName: company?.name ?? "(deleted company)",
    companySlug: company?.slug ?? "",
    companyStatus: company?.status ?? "missing",
    dnsDetail: d.lastCheck?.detail ?? null,
  }));
}

// ── Operator actions ─────────────────────────────────────────────────────────

export type DomainOp = "recheck" | "retry_attach" | "remove" | "set_primary";
export const DOMAIN_OPS: readonly DomainOp[] = ["recheck", "retry_attach", "remove", "set_primary"];
export type PlatformDomainResult = { ok: true; message: string } | { ok: false; error: string };

const AUDIT_ACTION: Record<DomainOp, string> = {
  recheck: "domain.recheck",
  retry_attach: "domain.attach_retry",
  remove: "domain.remove",
  set_primary: "domain.set_primary",
};

export async function runPlatformDomainAction(rawHost: string, op: DomainOp, actorId: string): Promise<PlatformDomainResult> {
  if (!DOMAIN_OPS.includes(op)) return { ok: false, error: "Unknown action." };
  const host = normalizeHost(rawHost);
  const db = await getPlatformDb();
  const d = host ? await db.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION).findOne({ _id: host }) : null;
  if (!d) return { ok: false, error: "That domain no longer exists." };

  let result: PlatformDomainResult;
  if (op === "retry_attach") {
    if (d._id.endsWith(".localhost")) return { ok: false, error: "Local development addresses aren't attached anywhere." };
    const sync = await syncAtProvider(d._id, "add");
    forgetCompanyRouting();
    forgetCompanySiteUrls();
    result = sync.error ? { ok: false, error: `The hosting provider (${sync.providerId}) couldn't attach ${d._id}: ${sync.error}` } : { ok: true, message: `${d._id} is attached at ${sync.providerId}.` };
  } else {
    const fn = op === "recheck" ? verifyCustomDomain : op === "remove" ? removeCustomDomain : setPrimaryDomain;
    const res = await runAsCompany(d.companyId, () => fn(d._id));
    result = res.ok ? { ok: true, message: res.message ?? "Done." } : { ok: false, error: res.error };
  }

  await recordPlatformAudit({
    actorId,
    action: AUDIT_ACTION[op],
    target: { type: "domain", id: d._id },
    companyId: d.companyId,
    details: { ok: result.ok, kind: d.kind ?? "custom", ...(result.ok ? {} : { error: result.error.slice(0, 200) }) },
  });
  return result;
}
