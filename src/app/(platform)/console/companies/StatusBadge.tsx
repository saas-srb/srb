import { Badge } from "@/components/ui/badge";
import type { CompanyStatus } from "@/lib/platform/tenancy/companies";

export default function StatusBadge({ status, isPlatformOwner }: { status: CompanyStatus; isPlatformOwner?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {status === "active" ? (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Active</Badge>
      ) : (
        <Badge variant="destructive">Suspended</Badge>
      )}
      {isPlatformOwner && <Badge variant="outline">Platform owner</Badge>}
    </span>
  );
}
