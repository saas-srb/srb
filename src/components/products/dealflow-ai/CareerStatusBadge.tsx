import { Badge } from "@/components/ui/badge";
import { getCareerApplicationStatusMeta } from "@/lib/career-application-status";

export default function CareerStatusBadge({ status }: { status?: string }) {
  const meta = getCareerApplicationStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </Badge>
  );
}
