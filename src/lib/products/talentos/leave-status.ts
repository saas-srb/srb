/** Client-safe leave-request status constants (no I/O). */

export const LEAVE_REQUEST_STATUSES = [
  { value: "pending", label: "Pending", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50" },
  { value: "approved", label: "Approved", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "rejected", label: "Rejected", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
  { value: "cancelled", label: "Cancelled", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/60" },
] as const;

export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number]["value"];

export function isValidLeaveStatus(v: string): v is LeaveRequestStatus {
  return LEAVE_REQUEST_STATUSES.some((s) => s.value === v);
}

export function getLeaveStatusMeta(v: string | undefined) {
  return LEAVE_REQUEST_STATUSES.find((s) => s.value === v) ?? LEAVE_REQUEST_STATUSES[0];
}
