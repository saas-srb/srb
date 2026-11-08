import "server-only";
import { getDb } from "@/lib/mongodb";
import { updateStamp } from "@/lib/products/cashflow-ai/db";

/**
 * The company's rules for money leaving it (`fms_payment_controls`, one document): the most one payment may be, the most in a day, the amount
 * from which a second person must approve, whether a confirmation code is asked before money moves, and how long a changed bank account waits
 * before it can be paid. The defaults are strict on purpose; only the company owner changes them.
 */

export interface PaymentControls {
  /** The most one payment may be (₹). */
  perPayoutMax: number;
  /** The most that may be sent in a day, all payments together (₹, India time). */
  dailyMax: number;
  /** The most salaries together may be sent in a day (₹, India time). */
  salaryDailyMax: number;
  /** A payment of this amount or more waits for a second person to approve (₹). */
  approvalThreshold: number;
  /** Ask the person for a confirmation code (authenticator app, else emailed) before money moves. */
  requireCode: boolean;
  /** Hours a payee's new or changed bank details must wait before they can be paid. */
  payeeHoldHours: number;
}

export const DEFAULT_CONTROLS: PaymentControls = {
  perPayoutMax: 1_000_000,
  dailyMax: 2_500_000,
  salaryDailyMax: 10_000_000,
  approvalThreshold: 100_000,
  requireCode: true,
  payeeHoldHours: 24,
};

const COLLECTION = "fms_payment_controls";

export async function getPaymentControls(): Promise<PaymentControls & { updatedBy: string | null }> {
  const doc = await (await getDb()).collection<PaymentControls & { _id: string; updatedBy?: string | null }>(COLLECTION).findOne({ _id: "main" });
  return { ...DEFAULT_CONTROLS, ...(doc ?? {}), updatedBy: doc?.updatedBy ?? null };
}

export function validateControls(input: Record<string, unknown>): { valid: true; data: PaymentControls } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const money = (k: keyof PaymentControls, min: number, max: number, label: string) => {
    const n = Math.round(Number(String(input[k] ?? "").replace(/[, ]/g, "")));
    if (!(n >= min && n <= max)) errors[k] = `${label} must be between ₹${min.toLocaleString("en-IN")} and ₹${max.toLocaleString("en-IN")}.`;
    return n;
  };
  const perPayoutMax = money("perPayoutMax", 1000, 100_000_000, "The most for one payment");
  const dailyMax = money("dailyMax", 1000, 1_000_000_000, "The most for a day");
  const salaryDailyMax = money("salaryDailyMax", 1000, 10_000_000_000, "The most in salaries for a day");
  const approvalThreshold = money("approvalThreshold", 0, 100_000_000, "The approval amount");
  const hold = Math.round(Number(input.payeeHoldHours));
  if (!(hold >= 0 && hold <= 168)) errors.payeeHoldHours = "Hours must be from 0 to 168.";
  if (!errors.dailyMax && !errors.perPayoutMax && dailyMax < perPayoutMax) errors.dailyMax = "The daily limit cannot be below the limit for one payment.";
  if (!errors.approvalThreshold && !errors.perPayoutMax && approvalThreshold > perPayoutMax) errors.approvalThreshold = "Approval must start at or below the limit for one payment.";
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { perPayoutMax, dailyMax, salaryDailyMax, approvalThreshold, requireCode: input.requireCode !== false && input.requireCode !== "false", payeeHoldHours: hold } };
}

export async function savePaymentControls(data: PaymentControls, actorId: string): Promise<void> {
  await (await getDb()).collection(COLLECTION).updateOne({ _id: "main" as never }, { $set: { ...data, ...updateStamp(actorId), updatedBy: actorId } }, { upsert: true });
}

/** The start of today in India time (UTC+5:30), as a Date. */
export function startOfIstDay(now = new Date()): Date {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);
}

/** Why a payment of `amount` may not go, given what has already been sent today; `null` when it may. */
export function limitProblem(amount: number, sentToday: number, c: PaymentControls): string | null {
  if (amount > c.perPayoutMax) return `One payment can be at most ₹${c.perPayoutMax.toLocaleString("en-IN")}. The company owner can change this under Payments → Limits.`;
  if (sentToday + amount > c.dailyMax) return `That would take today's payments above the daily limit of ₹${c.dailyMax.toLocaleString("en-IN")} (₹${sentToday.toLocaleString("en-IN")} already sent today). Try tomorrow, or ask the company owner to raise the limit.`;
  return null;
}
