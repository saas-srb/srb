/**
 * Where the root domain's DNS zone lives, and how to copy records between Vercel accounts (pure: the Vercel calls are in `vercel-dns-api.ts`).
 */

export type DnsAuthority = "this-team" | "other-team" | "external" | "unknown";

export interface DnsAuthorityResult {
  where: DnsAuthority;
  /** Plain-words next step for the owner. */
  next: string;
}

/**
 * `inThisTeam`: the domain is listed in the Vercel team of the current token (with its service type); `nameservers`: what the domain's
 * nameservers actually are (from Vercel's config read or a DNS lookup).
 */
export function classifyDnsAuthority(input: { root: string; inThisTeam: { serviceType: string } | null; nameservers: string[] | null }): DnsAuthorityResult {
  const ns = (input.nameservers ?? []).map((n) => n.toLowerCase());
  const atVercel = ns.some((n) => n.endsWith("vercel-dns.com"));
  if (input.inThisTeam) {
    if (input.inThisTeam.serviceType === "zeit.world" || atVercel) return { where: "this-team", next: `DNS for ${input.root} is managed in this Vercel account. Nothing to do: platform hosts and company addresses are created here.` };
    return { where: "external", next: `${input.root}'s DNS is at another DNS provider. Point *.${input.root} and the platform hosts there to cname.vercel-dns.com (see the neutral DNS note), and each address is attached by Domain sync.` };
  }
  if (atVercel) return { where: "other-team", next: `${input.root}'s DNS zone is in ANOTHER Vercel account. Either move the domain to this account (Vercel: Domains, the domain, Transfer to another team), or use "Copy DNS records to this account" here and then set the nameservers to this account's, or (best long term) keep DNS at a neutral provider.` };
  if (ns.length) return { where: "external", next: `${input.root}'s DNS is at an external provider (${ns[0]}). Create *.${input.root} and the platform hosts there as CNAME to cname.vercel-dns.com; Domain sync attaches every address to this project.` };
  return { where: "unknown", next: `Could not read ${input.root}'s DNS yet (no token for this account, or no nameservers found). Paste this account's Vercel token and check again.` };
}

export interface DnsRecordRow {
  id?: string;
  name: string;
  type: string;
  value: string;
  ttl?: number;
  mxPriority?: number;
  /** Records the platform itself manages (created by Vercel for a project). */
  creator?: string;
}

const NEVER_COPY = new Set(["NS", "SOA"]);

export interface DnsCopyPlan {
  create: DnsRecordRow[];
  skipped: { record: DnsRecordRow; reason: "managed-by-vercel" | "nameserver-or-soa" | "already-there" }[];
}

const same = (a: DnsRecordRow, b: DnsRecordRow) => a.type.toUpperCase() === b.type.toUpperCase() && (a.name || "@") === (b.name || "@") && a.value.replace(/\.$/, "").toLowerCase() === b.value.replace(/\.$/, "").toLowerCase();

/** What to create here from the old zone's records: never NS/SOA, never records Vercel manages, never what already exists. Nothing is ever deleted. */
export function planDnsCopy(source: DnsRecordRow[], existing: DnsRecordRow[]): DnsCopyPlan {
  const plan: DnsCopyPlan = { create: [], skipped: [] };
  for (const r of source) {
    if (NEVER_COPY.has(r.type.toUpperCase())) plan.skipped.push({ record: r, reason: "nameserver-or-soa" });
    else if (r.creator === "system" || /vercel-dns\.com\.?$/i.test(r.value) || r.value === "76.76.21.21") plan.skipped.push({ record: r, reason: "managed-by-vercel" });
    else if (existing.some((e) => same(e, r)) || plan.create.some((c) => same(c, r))) plan.skipped.push({ record: r, reason: "already-there" });
    else plan.create.push(r);
  }
  return plan;
}
