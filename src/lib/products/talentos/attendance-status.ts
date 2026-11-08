/** Client-safe attendance status constants (no I/O). */

export const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "half_day", label: "Half Day", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  { value: "absent", label: "Absent", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
  { value: "on_leave", label: "On Leave", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70" },
  { value: "holiday", label: "Holiday", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50" },
  { value: "weekly_off", label: "Weekly Off", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50" },
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]["value"];

export function isValidAttendanceStatus(v: string): v is AttendanceStatus {
  return ATTENDANCE_STATUSES.some((s) => s.value === v);
}

export function getAttendanceStatusMeta(v: string | undefined) {
  return ATTENDANCE_STATUSES.find((s) => s.value === v) ?? ATTENDANCE_STATUSES[2];
}

/** Statuses a user can set by hand (the rest are derived). */
export const MANUAL_ATTENDANCE_STATUSES: AttendanceStatus[] = ["present", "half_day", "absent"];
