import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted } from "@/lib/products/talentos/db";
import { getOrgSettings, classifyDay } from "@/lib/products/talentos/settings";
import { nowInOrgTz, parseHHmm } from "@/lib/products/talentos/time";
import { holidaySetInRange } from "@/lib/products/talentos/holidays";
import { ATTENDANCE_COLLECTION, ATTENDANCE_LOGS_COLLECTION, type AttendanceRecord } from "@/lib/products/talentos/attendance";
import { EMPLOYEES_COLLECTION, type Employee, type EmergencyContact } from "@/lib/products/talentos/employees";

/**
 * Employee self-service mutations. Every function operates strictly on the
 * caller's own `employeeId` — never an id passed from the client.
 */

async function attendanceCollection() {
  const db = await getDb();
  return db.collection<AttendanceRecord>(ATTENDANCE_COLLECTION);
}

interface SelfLog {
  _id: string;
  attendanceId: string;
  employeeId: string;
  date: string;
  type: "in" | "out";
  time: string;
  by: string;
  note: string;
  at: Date;
}

async function appendLog(entry: { attendanceId: string; employeeId: string; date: string; type: "in" | "out"; time: string }) {
  const db = await getDb();
  await db.collection<SelfLog>(ATTENDANCE_LOGS_COLLECTION).insertOne({
    _id: newId(),
    ...entry,
    by: entry.employeeId,
    note: "self-service",
    at: new Date(),
  });
}

export interface ClockState {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  status: string | null;
  locked: boolean; // HR-corrected — self-clock disabled
}

export async function getClockState(employeeId: string): Promise<ClockState> {
  const { date } = nowInOrgTz((await getOrgSettings()).timezone);
  const col = await attendanceCollection();
  const rec = await col.findOne({ employeeId, date });
  return {
    date,
    checkIn: rec?.checkIn ?? null,
    checkOut: rec?.checkOut ?? null,
    workedMinutes: rec?.workedMinutes ?? 0,
    status: rec?.status ?? null,
    locked: rec ? rec.source === "manual" || rec.source === "bulk" || rec.source === "leave" : false,
  };
}

export async function clockIn(
  employeeId: string
): Promise<{ ok: true; time: string } | { ok: false; error: string }> {
  const settings = await getOrgSettings();
  const { date, time } = nowInOrgTz(settings.timezone);
  const col = await attendanceCollection();
  const existing = await col.findOne({ employeeId, date });

  if (existing && (existing.source === "manual" || existing.source === "bulk" || existing.source === "leave")) {
    return { ok: false, error: "Today's attendance was set by HR. Contact HR for a correction." };
  }
  if (existing?.checkIn) return { ok: false, error: "You have already clocked in today." };

  const now = new Date();
  if (existing) {
    await col.updateOne({ _id: existing._id }, { $set: { checkIn: time, status: "present", source: "self", ...updateStamp(employeeId) } });
    await appendLog({ attendanceId: existing._id, employeeId, date, type: "in", time });
  } else {
    const rec: AttendanceRecord = {
      _id: newId(),
      employeeId,
      date,
      status: "present",
      checkIn: time,
      checkOut: null,
      breakMinutes: 0,
      workedMinutes: 0,
      isLate: false,
      lateByMinutes: 0,
      isEarlyDeparture: false,
      earlyByMinutes: 0,
      source: "self",
      leaveRequestId: null,
      note: null,
      ...createStamp(employeeId),
    };
    // late detection
    const lateThreshold = parseHHmm(settings.shiftStart) + settings.graceMinutes;
    const diff = parseHHmm(time) - lateThreshold;
    if (diff > 0) {
      rec.isLate = true;
      rec.lateByMinutes = diff;
    }
    await col.insertOne(rec);
    await appendLog({ attendanceId: rec._id, employeeId, date, type: "in", time });
  }
  void now;
  return { ok: true, time };
}

export async function clockOut(
  employeeId: string
): Promise<{ ok: true; time: string } | { ok: false; error: string }> {
  const settings = await getOrgSettings();
  const { date, time } = nowInOrgTz(settings.timezone);
  const col = await attendanceCollection();
  const existing = await col.findOne({ employeeId, date });

  if (!existing || !existing.checkIn) return { ok: false, error: "Clock in first." };
  if (existing.source === "manual" || existing.source === "bulk" || existing.source === "leave") {
    return { ok: false, error: "Today's attendance was set by HR. Contact HR for a correction." };
  }
  if (existing.checkOut) return { ok: false, error: "You have already clocked out today." };
  if (parseHHmm(time) <= parseHHmm(existing.checkIn)) return { ok: false, error: "Clock-out time is not after clock-in." };

  const worked = parseHHmm(time) - parseHHmm(existing.checkIn) - Math.max(0, existing.breakMinutes);
  const earlyThreshold = parseHHmm(settings.shiftEnd) - settings.earlyDepartureMinutes;
  const earlyDiff = earlyThreshold - parseHHmm(time);
  const status = worked / 60 >= settings.fullDayHours ? "present" : "half_day";

  await col.updateOne(
    { _id: existing._id },
    {
      $set: {
        checkOut: time,
        workedMinutes: Math.max(0, worked),
        isEarlyDeparture: earlyDiff > 0,
        earlyByMinutes: earlyDiff > 0 ? earlyDiff : 0,
        status,
        source: "self",
        ...updateStamp(employeeId),
      },
    }
  );
  await appendLog({ attendanceId: existing._id, employeeId, date, type: "out", time });
  return { ok: true, time };
}

// ---------------------------------------------------------------------------
// Own contact details
// ---------------------------------------------------------------------------

export interface OwnContactUpdate {
  phone: string | null;
  personalEmail: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  emergencyContacts: EmergencyContact[];
}

export async function updateOwnContact(employeeId: string, data: OwnContactUpdate): Promise<boolean> {
  const db = await getDb();
  const res = await db.collection<Employee>(EMPLOYEES_COLLECTION).updateOne(
    { _id: employeeId, ...notDeleted },
    {
      $set: {
        "personal.phone": data.phone,
        "personal.personalEmail": data.personalEmail,
        "personal.addressLine": data.addressLine,
        "personal.city": data.city,
        "personal.state": data.state,
        "personal.postalCode": data.postalCode,
        emergencyContacts: data.emergencyContacts,
        ...updateStamp(employeeId),
      },
    }
  );
  return res.matchedCount === 1;
}

/** Working-day check for the clock widget — is today a working day? */
export async function todayIsWorkingDay(): Promise<{ working: boolean; label: string; date: string }> {
  const settings = await getOrgSettings();
  const { date } = nowInOrgTz(settings.timezone);
  const holidaySet = await holidaySetInRange(date, date);
  const cls = classifyDay(date, settings, holidaySet);
  return {
    working: cls === "working",
    label: cls === "holiday" ? "Holiday" : cls === "weekly_off" ? "Weekly off" : "Working day",
    date,
  };
}
