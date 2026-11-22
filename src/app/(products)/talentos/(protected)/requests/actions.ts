"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser, type CurrentHrmsUser } from "@/lib/hrms-auth";
import { hrCan } from "@/lib/talentos-access";
import { hrReach, reaches } from "@/lib/products/talentos/scope";
import { paymentGate } from "@/lib/products/cashflow-ai/payment-guard";
import { recordAudit } from "@/lib/products/talentos/audit";
import { cancelRequest, createExpense, createOvertime, createShortLeave, decideRequest, getRequest } from "@/lib/products/talentos/work-requests";

export interface RequestResult {
  ok: boolean;
  error?: string;
}

export interface DecideResult {
  ok: boolean;
  error?: string;
}

const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => Number(str(v).replace(/[, ]/g, ""));

async function signedIn(): Promise<CurrentHrmsUser> {
  const user = await getCurrentHrmsUser();
  if (!user || user.mustChangePassword) throw new Error("Unauthorized");
  return user;
}

/** The person's own request: needs requests.submit, and the employee id always comes from the session. */
async function submitter(): Promise<{ user: CurrentHrmsUser; employeeId: string }> {
  const user = await signedIn();
  if (!hrCan(user, "requests.submit") || !user.employeeId) throw new Error("Forbidden");
  return { user, employeeId: user.employeeId };
}

function done(): RequestResult {
  revalidatePath("/talentos/requests");
  return { ok: true };
}

export async function requestOvertimeAction(input: Record<string, unknown>): Promise<RequestResult> {
  const { user, employeeId } = await submitter();
  const hours = num(input.hours);
  const minutes = Math.round(hours * 60);
  const r = await createOvertime(employeeId, { date: str(input.date), minutes, reason: str(input.reason) }, user.id);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "work_request", entityId: r.request._id, entityLabel: "Overtime", summary: `${minutes} min on ${r.request.date}` });
  return done();
}

export async function requestShortLeaveAction(input: Record<string, unknown>): Promise<RequestResult> {
  const { user, employeeId } = await submitter();
  const r = await createShortLeave(employeeId, { date: str(input.date), fromTime: str(input.fromTime), toTime: str(input.toTime), reason: str(input.reason) }, user.id);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "work_request", entityId: r.request._id, entityLabel: "Partial leave", summary: `${r.request.fromTime}-${r.request.toTime} on ${r.request.date}` });
  return done();
}

export async function requestExpenseAction(input: Record<string, unknown>): Promise<RequestResult> {
  const { user, employeeId } = await submitter();
  const r = await createExpense(
    employeeId,
    { category: str(input.category), title: str(input.title), vendor: str(input.vendor), billNumber: str(input.billNumber), billDate: str(input.billDate), amount: num(input.amount), reason: str(input.reason) },
    user.id,
  );
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "work_request", entityId: r.request._id, entityLabel: "Expense claim", summary: `₹${r.request.amount} ${r.request.title}` });
  return done();
}

export async function withdrawMyRequestAction(id: string): Promise<RequestResult> {
  const { user, employeeId } = await submitter();
  const req = await getRequest(id);
  if (!req || req.employeeId !== employeeId) return { ok: false, error: "Request not found." };
  const r = await cancelRequest(id, user.id);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "cancel", entity: "work_request", entityId: id, summary: "Withdrawn by employee" });
  return done();
}

export async function decideRequestAction(id: string, decision: "approved" | "rejected", note: string, opts: { approvedAmount?: number; payMonth?: string; payNow?: boolean; code?: string } = {}): Promise<DecideResult> {
  const user = await signedIn();
  if (!hrCan(user, "requests.decide")) throw new Error("Forbidden");
  if (decision === "approved" && opts.payNow) {
    const blocked = await paymentGate(user.id, opts.code);
    if (blocked) return { ok: false, error: blocked };
  }
  const req = await getRequest(id);
  if (!req) return { ok: false, error: "Request not found." };
  if (!reaches(await hrReach(user, "requests"), req.employeeId)) return { ok: false, error: "That request is outside your reporting line." };
  // Nobody approves their own request, whatever their access.
  if (user.employeeId && user.employeeId === req.employeeId) return { ok: false, error: "You cannot decide your own request. Ask another approver." };
  if (decision === "rejected" && !note.trim()) return { ok: false, error: "Say why it is rejected, so the employee knows." };

  const r = await decideRequest(id, decision, note.trim() || null, user.id, opts);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: decision === "approved" ? "approve" : "reject",
    entity: "work_request",
    entityId: id,
    entityLabel: req.kind,
    summary: decision === "approved" && req.kind === "expense" ? `approved ₹${r.request.approvedAmount} of ₹${req.amount}` : decision,
  });
  revalidatePath("/talentos/requests");
  revalidatePath("/talentos/payroll/items");
  return { ok: true };
}
