import "server-only";
import {
  getPaymentAnalytics as getTmsPaymentAnalytics,
  listPaymentsForStudent as listTmsPaymentsForStudent,
  type PaymentAnalytics,
  type PaymentView,
} from "@/lib/products/cohort-ai/payments";

/**
 * FMS's Training Revenue read layer (§51 Phase 6). TMS already computes and
 * records the real fee payment (`payments` collection, real installments,
 * methods, references) — the same posture as HRMS payroll (`fms/payroll.ts`):
 * nothing to fill in, this module only reads TMS's real exports directly and
 * never writes to any TMS collection.
 *
 * Deliberately NOT posted into `fms_transactions`/the Phase 5 journal —
 * retroactively synthesizing journal entries for historical TMS payments
 * would risk the ledger's balanced-by-construction invariant for no real
 * benefit. Kept as a clearly separate, TMS-sourced figure wherever it's
 * surfaced (see `trainingRevenue` on `FmsDashboardStats`), never merged into
 * the ledger-sourced `totalRevenue`.
 */

export async function trainingPaymentAnalytics(opts: { dateFrom?: Date; dateTo?: Date } = {}): Promise<PaymentAnalytics> {
  return getTmsPaymentAnalytics(opts);
}

export async function listTrainingPaymentsForStudent(studentId: string): Promise<PaymentView[]> {
  return listTmsPaymentsForStudent(studentId);
}

/** Total fees actually collected to date — for the FMS dashboard's Training Revenue KPI. */
export async function totalTrainingRevenueCollected(): Promise<number> {
  try {
    const analytics = await getTmsPaymentAnalytics();
    return analytics.totalCollected;
  } catch {
    return 0;
  }
}
