import "server-only";
import type { DomainProvider, DomainStatus } from "@/lib/platform/domains/types";
import { createVercelDomainProvider } from "@/lib/platform/domains/vercel";
import { resolveDomainConfig } from "@/lib/platform/integrations/resolve";

export type { DnsRecord, DomainStatus, DomainResult } from "@/lib/platform/domains/types";

/**
 * Manual adapter: nothing is attached automatically (local development, or
 * hosting without an API). Reports hosts as attached/verified so routing —
 * which is decided by `company_domains`, not by the provider — still works;
 * attaching them to the hosting project is then an operator task.
 */
const manualDomainProvider: DomainProvider = {
  id: "manual",
  add: async () => ({ ok: true, value: manualStatus }),
  status: async () => ({ ok: true, value: manualStatus }),
  verify: async () => ({ ok: true, value: manualStatus }),
  remove: async () => ({ ok: true, value: null }),
};
const manualStatus: DomainStatus = { attached: true, verified: true, dnsConfigured: true, records: [] };

/**
 * Platform Console → Integrations, falling back to `DOMAIN_PROVIDER` (`vercel` |
 * `manual`) and the `VERCEL_*` env vars; with nothing set it's Vercel when its
 * credentials exist, else manual.
 */
export async function activeDomainProvider(): Promise<DomainProvider> {
  const cfg = await resolveDomainConfig();
  return cfg.provider === "vercel" ? createVercelDomainProvider(cfg.vercel) : manualDomainProvider;
}
