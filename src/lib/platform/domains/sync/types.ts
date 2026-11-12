import type { DnsRecord, DomainStatus } from "@/lib/platform/domains/types";

/** Pure types of Domain sync (no server imports, so the engine and its tests run anywhere). */

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type AddResult = { ok: true; value: DomainStatus } | { ok: false; error: string; ownedElsewhere?: { records: DnsRecord[] } };

/** The small slice of the Vercel project-domains API the sync needs. Real adapter: `vercel-api.ts`; tests use fakes. */
export interface VercelDomainsApi {
  /** One page of the project's domain names (`cursor` null = first page; `next` null = last page). */
  listDomains(cursor: string | null): Promise<ApiResult<{ names: string[]; next: string | null; unverified?: string[] }>>;
  /** Attaches the host to the project. */
  addDomain(host: string, options?: { redirectTo?: string }): Promise<AddResult>;
  /** Current state of a host on the project; `null` value = it is not on the project. */
  domainStatus(host: string): Promise<ApiResult<DomainStatus | null>>;
  /** Asks Vercel to re-check ownership now (optional: falls back to `domainStatus`). */
  verifyDomain?(host: string): Promise<ApiResult<DomainStatus | null>>;
  /** Detaches the host from the project (404 counts as done). */
  removeDomain(host: string): Promise<ApiResult<null>>;
}

export type HostKind = "subdomain" | "subdomain-app" | "custom" | "custom-app" | "custom-alt" | "platform";

/** The state Domain sync (or normal provisioning) last stored for a host. */
export interface StoredHostState {
  attached: boolean;
  verified: boolean;
  dnsConfigured: boolean;
  challenged: boolean;
  syncStatus?: "ok" | "owned_elsewhere" | "failed";
}

export interface SyncTarget {
  host: string;
  companyId: string;
  kind: HostKind;
  /** The `company_domains` document holding this host's state; null when the company has none (its automatic address is routed by slug alone). */
  docId: string | null;
  field: "provider" | "appProvider";
  stored: StoredHostState | null;
  /** Attach as a redirect to this host (the bare platform domain redirects to www). */
  redirectTo?: string;
  /** For platform hosts: the role (root, www, app, wildcard). */
  role?: string;
}

/** What gets written for a host after the sync touched it. */
export interface HostWrite {
  attached: boolean;
  verified: boolean;
  dnsConfigured: boolean;
  records: DnsRecord[];
  error: string | null;
  syncStatus: "ok" | "owned_elsewhere" | "failed";
  /** STAFF-ONLY detail (the real reason a release/attach failed); never shown on a company's own page. */
  staffNote?: string | null;
}

export type SyncAction = "released" | "release_failed" | "attached" | "refreshed" | "owned_elsewhere" | "failed" | "would_release" | "would_attach" | "would_refresh" | "already_attached" | "needs_txt" | "previous_listed" | "previous_unavailable";

export interface SyncEvent {
  host: string;
  companyId: string;
  action: SyncAction;
  detail: string;
}

export interface SyncCounts {
  companies: number;
  hosts: number;
  alreadyOk: number;
  attached: number;
  released: number;
  refreshed: number;
  skippedWildcard: number;
  ownedElsewhere: number;
  failed: number;
  wouldAttach: number;
  wouldRelease: number;
}

export const emptyCounts = (): SyncCounts => ({ companies: 0, hosts: 0, alreadyOk: 0, attached: 0, released: 0, refreshed: 0, skippedWildcard: 0, ownedElsewhere: 0, failed: 0, wouldAttach: 0, wouldRelease: 0 });

/** What the engine needs from the database. */
export interface SyncStore {
  /** The next companies after `cursor` (company id order) with all of their hosts; `next` = the cursor to continue from, null when no companies are left. */
  loadBatch(cursor: string | null, size: number): Promise<{ companies: { companyId: string; targets: SyncTarget[] }[]; next: string | null }>;
  saveHost(target: SyncTarget, write: HostWrite): Promise<void>;
  /** Marks hosts that were checked and are fine as checked now (their stored status is only a cache). */
  touchHosts?(targets: SyncTarget[]): Promise<void>;
  event(e: SyncEvent): Promise<void>;
}
