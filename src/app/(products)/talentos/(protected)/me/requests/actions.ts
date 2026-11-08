"use server";

import { revalidatePath } from "next/cache";
import { requirePortalEmployee } from "@/lib/products/talentos/portal-guard";
import { recordAudit } from "@/lib/products/talentos/audit";
import { cancelRequest, createExpense, createOvertime, createShortLeave, getRequest } from "@/lib/products/talentos/work-requests";

export interface RequestResult {
  ok: boolean;
  error?: string;
}

const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => Number(str(v).replace(/[, ]/g, ""));

function done(): RequestResult {
  revalidatePath("/talentos/me/requests");
  revalidatePath("/talentos/requests");
  return { ok: true };
}

export async function requestOvertimeAction(input: Record<string, unknown>): Promise<RequestResult> {
  const { employeeId, userId, email } = await requirePortalEmployee();
  const hours = num(input.hours);
  const minutes = Math.round(hours * 60);
  const r = await createOvertime(employeeId, { date: str(input.date), minutes, reason: str(input.reason) }, userId);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: userId, actorEmail: email, action: "create", entity: "work_request", entityId: r.request._id, entityLabel: "Overtime", summary: `${minutes} min on ${r.request.date}` });
  return done();
}

export async function requestShortLeaveAction(input: Record<string, unknown>): Promise<RequestResult> {
  const { employeeId, userId, email } = await requirePortalEmployee();
  const r = await createShortLeave(employeeId, { date: str(input.date), fromTime: str(input.fromTime), toTime: str(input.toTime), reason: str(input.reason) }, userId);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: userId, actorEmail: email, action: "create", entity: "work_request", entityId: r.request._id, entityLabel: "Partial leave", summary: `${r.request.fromTime}-${r.request.toTime} on ${r.request.date}` });
  return done();
}

export async function requestExpenseAction(input: Record<string, unknown>): Promise<RequestResult> {
  const { employeeId, userId, email } = await requirePortalEmployee();
  const r = await createExpense(
    employeeId,
    { category: str(input.category), title: str(input.title), vendor: str(input.vendor), billNumber: str(input.billNumber), billDate: str(input.billDate), amount: num(input.amount), reason: str(input.reason) },
    userId,
  );
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: userId, actorEmail: email, action: "create", entity: "work_request", entityId: r.request._id, entityLabel: "Expense claim", summary: `₹${r.request.amount} ${r.request.title}` });
  return done();
}

export async function withdrawMyRequestAction(id: string): Promise<RequestResult> {
  const { employeeId, userId, email } = await requirePortalEmployee();
  const req = await getRequest(id);
  if (!req || req.employeeId !== employeeId) return { ok: false, error: "Request not found." };
  const r = await cancelRequest(id, userId);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: userId, actorEmail: email, action: "cancel", entity: "work_request", entityId: id, summary: "Withdrawn by employee" });
  return done();
}
