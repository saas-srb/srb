import { Badge } from "@/components/ui/badge";
import { getStatusMeta } from "@/lib/lead-status";

export default function StatusBadge({ status }: { status?: string }) {
  const meta = getStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </Badge>
  );
}
