"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { saveItemState } from "@/lib/products/cashflow-ai/compliance/tracker";
import { saveOwner } from "@/lib/products/cashflow-ai/compliance/owners";
import { generateYearFilings, getComplianceProfile, refreshYearDates, saveComplianceProfile, createFiling, deleteFiling, markFiled, setFilingStatus, updateFiling } from "@/lib/products/cashflow-ai/compliance/filings";

type Result = { ok: true } | { ok: false; error: string };

async function manager() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageCompliance(user)) throw new Error("Forbidden");
  return user;
}

function refresh() {
  revalidatePath("/cashflow-ai/compliance", "layout");
}

const text = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

export async function saveChecklistItemAction(itemKey: string, patch: { status?: string; owner?: string; note?: string }): Promise<Result> {
  const user = await manager();
  const res = await saveItemState({ itemKey, ...patch }, user.id, user.email);
  if (res.ok) refresh();
  return res;
}

export async function addFilingAction(fd: FormData): Promise<Result> {
  const user = await manager();
  const res = await createFiling(
    {
      name: text(fd, "name"),
      form: text(fd, "form"),
      category: text(fd, "category"),
      period: text(fd, "period"),
      dueDate: text(fd, "dueDate"),
      dueDateConfirmed: text(fd, "dueDateConfirmed") === "on",
      owner: text(fd, "owner"),
    },
    user.id,
    user.email
  );
  if (res.ok) refresh();
  return res.ok ? { ok: true } : res;
}

export async function saveProfileAction(answers: { gstRegistered?: boolean | null; hasEmployees?: boolean | null; deductsTds?: boolean | null; isPrivateLimited?: boolean | null }): Promise<Result> {
  const user = await manager();
  await saveComplianceProfile(answers, user.id, user.email);
  refresh();
  return { ok: true };
}

/** Fills the calendar from the platform's rulebook using the answers saved above. */
export async function fillCalendarAction(fy: string): Promise<{ ok: true; added: number; alreadyThere: number; confirmed: boolean } | { ok: false; error: string }> {
  const user = await manager();
  const res = await generateYearFilings(fy, await getComplianceProfile(), user);
  if (res.ok) refresh();
  return res;
}

export async function updateDatesAction(fy: string): Promise<{ ok: true; moved: number; skippedByHand: number } | { ok: false; error: string }> {
  const user = await manager();
  const res = await refreshYearDates(fy, user);
  if (res.ok) refresh();
  return res;
}

export async function updateFilingAction(id: string, patch: { dueDate?: string; dueDateConfirmed?: boolean; owner?: string; note?: string; period?: string }): Promise<Result> {
  const user = await manager();
  const res = await updateFiling(id, patch, user.id, user.email);
  if (res.ok) refresh();
  return res;
}

export async function markFiledAction(id: string, filedOn: string, ackNumber: string): Promise<Result> {
  const user = await manager();
  const res = await markFiled(id, { filedOn, ackNumber }, user.id, user.email);
  if (res.ok) refresh();
  return res;
}

export async function setFilingStatusAction(id: string, status: "pending" | "not_applicable"): Promise<Result> {
  const user = await manager();
  const res = await setFilingStatus(id, status, user.id, user.email);
  if (res.ok) refresh();
  return res;
}

export async function deleteFilingAction(id: string): Promise<Result> {
  const user = await manager();
  const res = await deleteFiling(id, user.id, user.email);
  if (res.ok) refresh();
  return res;
}

export async function saveOwnerAction(workstreamKey: string, patch: { primary?: string; reviewer?: string; contact?: string }): Promise<Result> {
  const user = await manager();
  const res = await saveOwner({ workstreamKey, ...patch }, user.id, user.email);
  if (res.ok) refresh();
  return res;
}
