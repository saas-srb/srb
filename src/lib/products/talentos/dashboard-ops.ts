import "server-only";
import { getTodaySnapshot, getAttendanceOverview, type AttendanceOverviewPoint } from "@/lib/products/talentos/attendance";
import { getPendingLeaveCount, getLeaveAnalytics, type LeaveAnalytics } from "@/lib/products/talentos/leave";
import { descendantEmployeeIds } from "@/lib/products/talentos/employees";

/**
 * Operations KPIs + charts for the HRMS dashboard — the surfaces that were
 * placeholder cards in Phase 1. Kept separate from `dashboard.ts` (headcount /
 * attrition analytics) so each stays focused.
 */

export interface HrmsOperationsStats {
  presentToday: number;
  onLeaveToday: number;
  lateToday: number;
  headcount: number;
  pendingLeaveRequests: number;
  attendanceOverview: AttendanceOverviewPoint[];
  leaveAnalytics: LeaveAnalytics;
}

export async function getHrmsOperationsStats(opts: {
  from: string;
  to: string;
  restrictToManagerId?: string;
}): Promise<HrmsOperationsStats> {
  const restrictIds = opts.restrictToManagerId ? await descendantEmployeeIds(opts.restrictToManagerId) : undefined;

  const [snapshot, pendingLeaveRequests, attendanceOverview, leaveAnalytics] = await Promise.all([
    getTodaySnapshot(opts.restrictToManagerId),
    getPendingLeaveCount(restrictIds),
    getAttendanceOverview(opts.from, opts.to, { restrictToManagerId: opts.restrictToManagerId }),
    getLeaveAnalytics(opts.from, opts.to),
  ]);

  return {
    presentToday: snapshot.presentToday,
    onLeaveToday: snapshot.onLeaveToday,
    lateToday: snapshot.lateToday,
    headcount: snapshot.headcount,
    pendingLeaveRequests,
    attendanceOverview,
    leaveAnalytics,
  };
}
