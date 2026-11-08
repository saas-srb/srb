"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canApproveTransactions, canReconcile, canViewCommercialFinance, canViewFinancialStatements } from "@/lib/fms-roles";
import { approveWriteOff, parseAmount, previewConfirmation, proposeWriteOff, saveConfirmation, withdrawWriteOff, CONFIRMATION_STATUSES, type ConfirmationStatus } from "@/lib/products/cashflow-ai/party-recon/store";
import type { ConfirmationComparison, PartyKind } from "@/lib/products/cashflow-ai/party-recon/core";

type Result = { ok: true } | { ok: false; error: string };

async function viewer() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!(canViewCommercialFinance(user) || canViewFinancialStatements(user))) throw new Error("Forbidden");
  return user;
}
async function reconciler() {
  const user = await viewer();
  if (!canReconcile(user)) throw new Error("Forbidden");
  return user;
}
async function approver() {
  const user = await viewer();
  if (!canApproveTransactions(user)) throw new Error("Forbidden");
  return user;
}

const asKind = (v: unknown): PartyKind | null => (v === "customer" || v === "vendor" ? v : null);
const asId = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length <= 80 ? v : null);
const asText = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

function refresh() {
  revalidatePath("/cashflow-ai/party-reconciliation", "layout");
}

export async function previewConfirmationAction(input: { kind: string; partyId: string; theirBalance: string; theirAsOf: string }): Promise<{ ok: true; comparison: ConfirmationComparison } | { ok: false; error: string }> {
  await viewer();
  const kind = asKind(input.kind);
  const partyId = asId(input.partyId);
  const their = parseAmount(input.theirBalance);
  if (!kind || !partyId) return { ok: false, error: "Choose a customer or vendor." };
  if (their === null) return { ok: false, error: "Enter their balance as a number, for example 1,25,000.00. Use a minus sign if they owe us." };
  return previewConfirmation({ kind, partyId, theirBalance: their, theirAsOf: asText(input.theirAsOf, 10) });
}

export async function saveConfirmationAction(input: { kind: string; partyId: string; asOf: string; theirBalance: string; status: string; note: string }): Promise<Result> {
  const user = await reconciler();
  const kind = asKind(input.kind);
  const partyId = asId(input.partyId);
  if (!kind || !partyId) return { ok: false, error: "Choose a customer or vendor." };
  const status = CONFIRMATION_STATUSES.find((s) => s.value === input.status)?.value as ConfirmationStatus | undefined;
  if (!status) return { ok: false, error: "Choose a status." };
  const raw = asText(input.theirBalance, 40).trim();
  const their = raw === "" ? null : parseAmount(raw);
  if (raw !== "" && their === null) return { ok: false, error: "Enter their balance as a number." };
  const res = await saveConfirmation({ kind, partyId, asOf: asText(input.asOf, 10), theirBalance: their, status, note: asText(input.note, 1000) }, { id: user.id, email: user.email });
  if (res.ok) refresh();
  return res.ok ? { ok: true } : res;
}

export async function proposeWriteOffAction(input: { kind: string; partyId: string; docId: string; amount: string; reason: string }): Promise<Result> {
  const user = await reconciler();
  const kind = asKind(input.kind);
  const partyId = asId(input.partyId);
  const docId = asId(input.docId);
  const amount = parseAmount(input.amount);
  if (!kind || !partyId || !docId) return { ok: false, error: "Choose the invoice or bill." };
  if (amount === null) return { ok: false, error: "Enter the amount as a number." };
  const res = await proposeWriteOff({ kind, partyId, docId, amount, reason: asText(input.reason, 500) }, { id: user.id, email: user.email });
  if (res.ok) refresh();
  return res.ok ? { ok: true } : res;
}

export async function approveWriteOffAction(id: string): Promise<Result> {
  const user = await approver();
  const wid = asId(id);
  if (!wid) return { ok: false, error: "Write-off not found." };
  const res = await approveWriteOff(wid, { id: user.id, email: user.email });
  if (res.ok) refresh();
  return res;
}

export async function withdrawWriteOffAction(id: string): Promise<Result> {
  const user = await reconciler();
  const wid = asId(id);
  if (!wid) return { ok: false, error: "Write-off not found." };
  const res = await withdrawWriteOff(wid, { id: user.id, email: user.email });
  if (res.ok) refresh();
  return res;
}
