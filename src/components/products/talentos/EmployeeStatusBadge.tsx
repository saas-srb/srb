import { Badge } from "@/components/ui/badge";
import { getEmployeeStatusMeta } from "@/lib/products/talentos/employee-status";

export default function EmployeeStatusBadge({ status }: { status?: string }) {
  const meta = getEmployeeStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </Badge>
  );
}
