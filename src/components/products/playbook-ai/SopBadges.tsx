import { Badge } from "@/components/ui/badge";
import { getConfidentialityMeta, getPriorityMeta, getSopStatusMeta } from "@/lib/products/playbook-ai/constants";
import { Lock } from "lucide-react";

export function SopStatusBadge({ status }: { status?: string }) {
  const meta = getSopStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority?: string }) {
  const meta = getPriorityMeta(priority);
  return <Badge className={meta.badgeClass}>{meta.label}</Badge>;
}

export function ConfidentialityBadge({ level }: { level?: string }) {
  const meta = getConfidentialityMeta(level);
  return (
    <Badge className={meta.badgeClass} title={meta.description}>
      {level && level !== "internal" && <Lock className="size-3" />}
      {meta.label}
    </Badge>
  );
}

export function AssignmentStateBadge({ state }: { state: "acknowledged" | "overdue" | "pending" }) {
  const map = {
    acknowledged: { label: "Acknowledged", cls: "bg-green-500/15 text-green-600 dark:text-green-400", dot: "bg-green-500" },
    pending: { label: "Pending", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
    overdue: { label: "Overdue", cls: "bg-destructive/15 text-destructive", dot: "bg-destructive" },
  } as const;
  const m = map[state];
  return (
    <Badge className={m.cls}>
      <span className={`size-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </Badge>
  );
}
