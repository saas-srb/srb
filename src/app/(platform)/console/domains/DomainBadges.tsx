import { Badge } from "@/components/ui/badge";
import type { CompanyDomainView } from "@/lib/platform/domains/types";

const green = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
const amber = "bg-amber-500/15 text-amber-700 dark:text-amber-400";

export function DnsBadge({ status }: { status: CompanyDomainView["status"] }) {
  return status === "verified" ? <Badge className={green}>Verified</Badge> : <Badge className={amber}>Pending</Badge>;
}

export function SslBadge({ ssl, error }: { ssl: CompanyDomainView["hosting"]["ssl"]; error?: string | null }) {
  if (ssl === "active") return <Badge className={green}>SSL active</Badge>;
  if (ssl === "manual") return <Badge variant="outline">Manual</Badge>;
  if (ssl === "error") return <Badge variant="destructive" title={error ?? undefined}>SSL error</Badge>;
  return <Badge className={amber}>SSL pending</Badge>;
}

/** Provider attach state: which provider, and whether its DNS check passes. */
export function ProviderBadge({ hosting }: { hosting: CompanyDomainView["hosting"] }) {
  if (!hosting.providerId) return <span className="text-xs text-muted-foreground">Local</span>;
  if (hosting.error) return <Badge variant="destructive" title={hosting.error}>{hosting.providerId}: failed</Badge>;
  if (hosting.providerId === "manual") return <Badge variant="outline">manual</Badge>;
  return <Badge variant="outline">{hosting.providerId}{hosting.dnsConfigured ? " · DNS ok" : " · DNS missing"}</Badge>;
}
