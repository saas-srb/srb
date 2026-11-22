import type { Guard } from "../types";

/**
 * TalentOS coverage (staged: only the modules already converted are listed here and enforced by the coverage test; see `micro/staged.ts`). Keys are paths under
 * src/app/(products), `#function` for server actions. Section pages are checked by their folder's layout (`viaLayout`).
 */
const P = "talentos/(protected)";
const open = (open: "self-service" | "session" | "public" | "redirect", reason: string): Guard => ({ open, reason });
const layout = (...any: string[]): Guard => ({ any, viaLayout: true, via: "hrPage" });

/** Folders of the modules that are converted so far (a module's folder is added here when its conversion is finished). */
export const TALENTOS_ROOTS = [
  // Leave
  "src/app/(products)/talentos/(protected)/leave",
  "src/app/(products)/talentos/(protected)/me/leave",
  // Attendance
  "src/app/(products)/talentos/(protected)/attendance",
  "src/app/(products)/talentos/(protected)/me/attendance",
  // Requests
  "src/app/(products)/talentos/(protected)/requests",
  "src/app/(products)/talentos/(protected)/me/requests",
  // Holidays
  "src/app/(products)/talentos/(protected)/holidays",
];

export const TALENTOS_COVERAGE: Record<string, Guard> = {
  // Leave
  [`${P}/leave/page.tsx`]: layout("leave.view"),
  [`${P}/leave/actions.ts#previewLeaveDaysAction`]: { any: ["leave.apply", "leave.approve"] },
  [`${P}/leave/actions.ts#applyMyLeaveAction`]: { any: ["leave.apply"] },
  [`${P}/leave/actions.ts#fileLeaveAction`]: { any: ["leave.approve"], via: "requireHrAct" },
  [`${P}/leave/actions.ts#decideLeaveAction`]: { any: ["leave.approve"] },
  [`${P}/leave/actions.ts#cancelMyLeaveAction`]: { any: ["leave.apply"] },
  [`${P}/leave/actions.ts#cancelLeaveAction`]: { any: ["leave.approve"] },
  [`${P}/leave/actions.ts#setLeaveAllocationAction`]: { any: ["employees.manage"] },
  [`${P}/me/leave/page.tsx`]: open("redirect", "The old My Leave address only sends the person to the normal Leave page, which checks leave.view."),
  // Attendance
  [`${P}/attendance/page.tsx`]: layout("attendance.view"),
  [`${P}/attendance/actions.ts#clockInAction`]: { any: ["attendance.punch"] },
  [`${P}/attendance/actions.ts#clockOutAction`]: { any: ["attendance.punch"] },
  [`${P}/attendance/actions.ts#recordAttendanceAction`]: { any: ["attendance.manage"], via: "requireAttendance" },
  [`${P}/attendance/actions.ts#bulkMarkAttendanceAction`]: { any: ["attendance.manage"], via: "requireAttendance" },
  [`${P}/me/attendance/page.tsx`]: open("redirect", "The old My Attendance address only sends the person to the normal Attendance page, which checks attendance.view."),
  // Requests
  [`${P}/requests/page.tsx`]: layout("requests.view"),
  [`${P}/requests/actions.ts#requestOvertimeAction`]: { any: ["requests.submit"], via: "submitter" },
  [`${P}/requests/actions.ts#requestShortLeaveAction`]: { any: ["requests.submit"], via: "submitter" },
  [`${P}/requests/actions.ts#requestExpenseAction`]: { any: ["requests.submit"], via: "submitter" },
  [`${P}/requests/actions.ts#withdrawMyRequestAction`]: { any: ["requests.submit"], via: "submitter" },
  [`${P}/requests/actions.ts#decideRequestAction`]: { any: ["requests.decide"] },
  [`${P}/me/requests/page.tsx`]: open("redirect", "The old My requests address only sends the person to the normal Requests page, which checks requests.view."),
  // Holidays
  [`${P}/holidays/page.tsx`]: layout("holidays.view"),
  [`${P}/holidays/actions.ts#saveHolidayAction`]: { any: ["holidays.manage"], via: "requireHolidays" },
  [`${P}/holidays/actions.ts#deleteHolidayAction`]: { any: ["holidays.manage"], via: "requireHolidays" },
};

/** Features that guard something without a mapped page or action: where they are enforced. */
export const TALENTOS_EXTRA: Record<string, string> = {
  "leave.team": "The Leave page and the Ask AI leave tools confine records to the person's reporting line (hrReach).",
  "leave.all": "The Leave page and the Ask AI leave tools show everyone's records (hrReach).",
  "leave.view": "The Leave layout and the menu.",
  "requests.team": "The Requests page confines the queue to the person's reporting line (hrReach).",
  "requests.all": "The Requests page shows everyone's requests (hrReach).",
  "attendance.team": "The Attendance page and the Ask AI attendance tools confine the register and report to the person's reporting line (hrReach).",
  "attendance.all": "The Attendance page and the Ask AI attendance tools show everyone (hrReach).",
};
