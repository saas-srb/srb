import { Badge } from "@/components/ui/badge";
import {
  getProgramCategoryMeta,
  getProgramStatusMeta,
  getTrainingModeMeta,
  getBatchStatusMeta,
  getStudentStatusMeta,
  getPaymentStatusMeta,
  getClassStatusMeta,
  getAttendanceMeta,
  getLiveProjectStatusMeta,
  getSubmissionStatusMeta,
} from "@/lib/products/cohort-ai/constants";

function Dot({ className }: { className: string }) {
  return <span className={`size-1.5 rounded-full ${className}`} />;
}

export function ProgramCategoryBadge({ category }: { category?: string }) {
  const meta = getProgramCategoryMeta(category);
  return (
    <Badge className={meta.badgeClass}>
      <Dot className={meta.dotClass} />
      {meta.label}
    </Badge>
  );
}

export function ProgramStatusBadge({ status }: { status?: string }) {
  const meta = getProgramStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <Dot className={meta.dotClass} />
      {meta.label}
    </Badge>
  );
}

export function TrainingModeBadge({ mode }: { mode?: string }) {
  const meta = getTrainingModeMeta(mode);
  return (
    <Badge className={meta.badgeClass}>
      <Dot className={meta.dotClass} />
      {meta.label}
    </Badge>
  );
}

export function BatchStatusBadge({ status }: { status?: string }) {
  const meta = getBatchStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <Dot className={meta.dotClass} />
      {meta.label}
    </Badge>
  );
}

export function StudentStatusBadge({ status }: { status?: string }) {
  const meta = getStudentStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <Dot className={meta.dotClass} />
      {meta.label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status?: string }) {
  const meta = getPaymentStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <Dot className={meta.dotClass} />
      {meta.label}
    </Badge>
  );
}

export function ClassStatusBadge({ status }: { status?: string }) {
  const meta = getClassStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <Dot className={meta.dotClass} />
      {meta.label}
    </Badge>
  );
}

export function AttendanceBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">Not marked</span>;
  const meta = getAttendanceMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <Dot className={meta.dotClass} />
      {meta.label}
    </Badge>
  );
}

export function LiveProjectStatusBadge({ status }: { status?: string }) {
  const meta = getLiveProjectStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <Dot className={meta.dotClass} />
      {meta.label}
    </Badge>
  );
}

export function SubmissionStatusBadge({ status }: { status?: string }) {
  const meta = getSubmissionStatusMeta(status);
  return (
    <Badge className={meta.badgeClass}>
      <Dot className={meta.dotClass} />
      {meta.label}
    </Badge>
  );
}
