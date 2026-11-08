"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { saveReturn } from "@/lib/products/cashflow-ai/income-tax/returns-store";
import { addNoticeEvent, saveNotice, setNoticeStatus } from "@/lib/products/cashflow-ai/income-tax/notices-store";
import type { NoticeStatus } from "@/lib/products/cashflow-ai/income-tax/registers-core";

type Result = { ok: true } | { ok: false; error: string };

// Every action re-checks the permission: hiding a button on the page is not the boundary.
async function guard(): Promise<{ error: string; actor?: undefined } | { actor: { id: string; email: string | null }; error?: undefined }> {
  const user = await getCurrentFmsUser();
  if (!user) return { error: "Please sign in again." };
  if (!canManageCompliance(user)) return { error: "You do not have permission to change return, audit or notice records." };
  return { actor: { id: user.id, email: user.email } };
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
/** Optional text field: absent or null is fine, anything else must be a string within the cap. */
const opt = (v: unknown, max: number): { ok: true; v: string | null } | { ok: false } => (v == null ? { ok: true, v: null } : typeof v === "string" && v.length <= max ? { ok: true, v } : { ok: false });
const done = (res: Result): Result => {
  if (res.ok) revalidatePath("/cashflow-ai/income-tax", "layout");
  return res;
};
const TOO_LONG: Result = { ok: false, error: "One of the entries is too long. Please shorten it." };

export async function saveReturnAction(fy: unknown, input: unknown): Promise<Result> {
  const g = await guard();
  if (!g.actor) return { ok: false, error: g.error ?? "Not allowed." };
  const year = str(fy, 10);
  if (!year) return { ok: false, error: "Choose a financial year like 2026-27." };
  const i = (input ?? {}) as Record<string, unknown>;
  const f = {
    formLabel: opt(i.formLabel, 40), filedOn: opt(i.filedOn, 10), acknowledgementNo: opt(i.acknowledgementNo, 60), verifiedOn: opt(i.verifiedOn, 10),
    auditReportFiledOn: opt(i.auditReportFiledOn, 10), auditUdin: opt(i.auditUdin, 60), auditedBy: opt(i.auditedBy, 120), note: opt(i.note, 500),
  };
  if (Object.values(f).some((x) => !x.ok)) return TOO_LONG;
  const v = (k: keyof typeof f) => (f[k] as { ok: true; v: string | null }).v;
  const audit = i.auditApplicable;
  if (audit !== "yes" && audit !== "no" && audit !== "undecided") return { ok: false, error: "Choose whether a tax audit applies." };
  return done(await saveReturn(year, { formLabel: v("formLabel"), filedOn: v("filedOn"), acknowledgementNo: v("acknowledgementNo"), verifiedOn: v("verifiedOn"), auditApplicable: audit, auditReportFiledOn: v("auditReportFiledOn"), auditUdin: v("auditUdin"), auditedBy: v("auditedBy"), note: v("note") }, g.actor));
}

export async function saveNoticeAction(id: unknown, input: unknown): Promise<Result> {
  const g = await guard();
  if (!g.actor) return { ok: false, error: g.error ?? "Not allowed." };
  if (id !== null && str(id, 100) === null) return { ok: false, error: "Notice not found." };
  const i = (input ?? {}) as Record<string, unknown>;
  const type = str(i.type, 80), receivedOn = str(i.receivedOn, 10), status = str(i.status, 20);
  const reference = opt(i.reference, 120), fy = opt(i.fy, 10), due = opt(i.responseDueOn, 10), note = opt(i.note, 500);
  if (type === null || receivedOn === null || status === null) return { ok: false, error: "Fill in the notice type, the date received and the status." };
  if (!reference.ok || !fy.ok || !due.ok || !note.ok) return TOO_LONG;
  const amount = i.amountDemanded == null ? null : typeof i.amountDemanded === "number" && Number.isFinite(i.amountDemanded) ? i.amountDemanded : undefined;
  if (amount === undefined) return { ok: false, error: "Enter the amount demanded as a number, or leave it blank." };
  return done(await saveNotice(id as string | null, { type, reference: reference.v, fy: fy.v, receivedOn, responseDueOn: due.v, status: status as NoticeStatus, amountDemanded: amount, note: note.v }, g.actor));
}

export async function setNoticeStatusAction(id: unknown, status: unknown): Promise<Result> {
  const g = await guard();
  if (!g.actor) return { ok: false, error: g.error ?? "Not allowed." };
  if (typeof id !== "string" || !id || id.length > 100 || typeof status !== "string") return { ok: false, error: "Notice not found." };
  return done(await setNoticeStatus(id, status as NoticeStatus, g.actor));
}

export async function addNoticeEventAction(id: unknown, input: unknown): Promise<Result> {
  const g = await guard();
  if (!g.actor) return { ok: false, error: g.error ?? "Not allowed." };
  const i = (input ?? {}) as Record<string, unknown>;
  const date = str(i.date, 10), text = str(i.text, 1000);
  if (typeof id !== "string" || !id || id.length > 100) return { ok: false, error: "Notice not found." };
  if (date === null || text === null) return { ok: false, error: "Enter the date and what happened (up to 1000 characters)." };
  return done(await addNoticeEvent(id, { date, text }, g.actor));
}
