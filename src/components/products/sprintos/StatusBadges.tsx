import { Badge } from "@/components/ui/badge";
import {
  getProjectStatusMeta,
  getPriorityMeta,
  getClientStatusMeta,
  getTaskStatusMeta,
  PROJECT_HEALTH_META,
  type ProjectHealth,
} from "@/lib/products/sprintos/constants";

export function TaskStatusBadge({ status }: { status?: string }) {
  const meta = getTaskStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </Badge>
  );
}

export function ProjectStatusBadge({ status }: { status?: string }) {
  const meta = getProjectStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority?: string }) {
  const meta = getPriorityMeta(priority);
  return (
    <Badge className={meta.badgeClass}>
      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </Badge>
  );
}

export function ClientStatusBadge({ status }: { status?: string }) {
  const meta = getClientStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </Badge>
  );
}

export function ProjectHealthBadge({ health }: { health: ProjectHealth }) {
  const meta = PROJECT_HEALTH_META[health];
  return (
    <Badge className={meta.badgeClass}>
      <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </Badge>
  );
}
