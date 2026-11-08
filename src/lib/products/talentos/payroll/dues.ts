/**
 * What the employer owes the government out of a payroll month, when, and what has been paid. Pure: no I/O.
 *
 * Five payments come out of a month's salary: provident fund (EPFO), ESI (ESIC), tax deducted from salaries (income-tax department),
 * professional tax and labour welfare fund (each state). The amounts are summed from the month's payslips. The due dates written here are
 * the ones the central law sets; professional tax and labour welfare fund dates differ by state, so they are left for the company to
 * enter when it records the payment.
 */

export type DueKind = "pf" | "esi" | "tds" | "pt" | "lwf";

export const DUE_LABELS: Record<DueKind, string> = {
  pf: "Provident fund (EPFO)",
  esi: "Employees' State Insurance (ESIC)",
  tds: "Income tax deducted from salary (TDS)",
  pt: "Professional tax",
  lwf: "Labour welfare fund",
};

/** One payslip's statutory amounts, as a due needs them. */
export interface DueSlip {
  state: string | null;
  pfEmployee: number;
  pfEmployer: number;
  pfEdli: number;
  pfAdmin: number;
  esiEmployee: number;
  esiEmployer: number;
  tds: number;
  pt: number;
  lwfEmployee: number;
  lwfEmployer: number;
}

export interface DuePayment {
  id: string;
  kind: DueKind;
  state: string | null;
  amount: number;
  paidOn: string;
  reference: string;
  /** Tax challans: the bank's BSR code and the challan serial number. */
  bsrCode: string | null;
  challanSerial: string | null;
  note: string | null;
  /** The company account it was paid from, as a label. */
  accountLabel?: string | null;
}

export type DueStatus = "paid" | "part_paid" | "due" | "overdue" | "nothing_due";

export interface Due {
  key: string;
  kind: DueKind;
  state: string | null;
  label: string;
  amount: number;
  breakdown: { label: string; amount: number }[];
  /** `null` when the date is set by the state. */
  dueDate: string | null;
  paid: number;
  balance: number;
  status: DueStatus;
  payments: DuePayment[];
  /** TDS only: interest under section 201(1A) if paid late, at 1.5% for every month or part of a month from the deduction. An estimate. */
  interestEstimate: number | null;
  note: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? { y: y + 1, m: 1 } : { y, m: mo + 1 };
};

/**
 * The central due date for a month's payment: PF and ESI on the 15th of the next month; tax deducted from salary on the 7th of the next
 * month, except March, which is due on 30 April. State dues return `null`.
 */
export function dueDate(kind: DueKind, month: string): string | null {
  const n = nextMonth(month);
  if (kind === "pf" || kind === "esi") return `${n.y}-${pad(n.m)}-15`;
  if (kind === "tds") return month.endsWith("-03") ? `${n.y}-04-30` : `${n.y}-${pad(n.m)}-07`;
  return null;
}

const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};

/** Months, counting a part month as a whole one, from `from` to `to` (both "yyyy-mm-dd"); 0 when `to` is not after `from`. */
export function monthsOrPart(from: string, to: string): number {
  if (to <= from) return 0;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td > fd) months += 1;
  return Math.max(1, months);
}

/** Interest on tax deducted but paid late: 1.5% a month or part of a month, from the day it was deducted (taken as the month's last day). */
export function tdsInterest(amount: number, month: string, paidOn: string): number {
  return Math.round(amount * 0.015 * monthsOrPart(lastDayOf(month), paidOn));
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function buildDues(month: string, slips: DueSlip[], payments: DuePayment[], today: string): Due[] {
  const out: Due[] = [];
  const make = (kind: DueKind, state: string | null, breakdown: { label: string; amount: number }[], note: string | null) => {
    const amount = sum(breakdown.map((b) => b.amount));
    const mine = payments.filter((p) => p.kind === kind && (p.state ?? null) === state);
    const paid = sum(mine.map((p) => p.amount));
    const due = dueDate(kind, month);
    const balance = Math.max(0, amount - paid);
    const lateAfter = due !== null && today > due;
    const status: DueStatus = amount === 0 ? "nothing_due" : balance === 0 ? "paid" : lateAfter ? "overdue" : paid > 0 ? "part_paid" : "due";
    // Interest runs to the date paid; for what is still unpaid, to today.
    const lastPaid = mine.map((p) => p.paidOn).sort().at(-1);
    out.push({
      key: `${kind}:${state ?? ""}`,
      kind,
      state,
      label: state ? `${DUE_LABELS[kind]}, ${state}` : DUE_LABELS[kind],
      amount,
      breakdown: breakdown.filter((b) => b.amount > 0),
      dueDate: due,
      paid,
      balance,
      status,
      payments: mine,
      interestEstimate: kind === "tds" && amount > 0 ? tdsInterest(balance > 0 ? balance : amount, month, balance > 0 ? today : (lastPaid ?? today)) : null,
      note,
    });
  };

  make(
    "pf",
    null,
    [
      { label: "Employees' share (A/c 1)", amount: sum(slips.map((s) => s.pfEmployee)) },
      { label: "Employer's share: EPF and pension (A/c 1 and 10)", amount: sum(slips.map((s) => s.pfEmployer)) },
      { label: "EDLI insurance (A/c 21)", amount: sum(slips.map((s) => s.pfEdli)) },
      { label: "Administrative charges (A/c 2)", amount: sum(slips.map((s) => s.pfAdmin)) },
    ],
    "Pay with the ECR challan on the EPFO unified portal. Late payment attracts interest and damages.",
  );
  make(
    "esi",
    null,
    [
      { label: "Employees' share", amount: sum(slips.map((s) => s.esiEmployee)) },
      { label: "Employer's share", amount: sum(slips.map((s) => s.esiEmployer)) },
    ],
    "Pay with the ESIC monthly challan. Late payment attracts interest.",
  );
  make("tds", null, [{ label: "Tax deducted from salaries", amount: sum(slips.map((s) => s.tds)) }], "Pay with challan ITNS 281 (code 92B, salary). Keep the BSR code and challan serial: the quarterly return needs them.");

  const byState = (pick: (s: DueSlip) => number) => {
    const m = new Map<string, number>();
    for (const s of slips) m.set(s.state ?? "State not set", (m.get(s.state ?? "State not set") ?? 0) + pick(s));
    return [...m].filter(([, v]) => v > 0).sort(([a], [b]) => a.localeCompare(b));
  };
  for (const [state, amount] of byState((s) => s.pt)) make("pt", state === "State not set" ? null : state, [{ label: "Deducted from employees", amount }], "Due date and payment portal are set by the state.");
  for (const [state] of byState((s) => s.lwfEmployee + s.lwfEmployer)) {
    const of = slips.filter((s) => (s.state ?? "State not set") === state);
    make("lwf", state === "State not set" ? null : state, [{ label: "Employees' share", amount: sum(of.map((s) => s.lwfEmployee)) }, { label: "Employer's share", amount: sum(of.map((s) => s.lwfEmployer)) }], "Due date and payment portal are set by the state; some states collect only in certain months.");
  }
  return out;
}

export interface Deadline {
  date: string;
  title: string;
  detail: string;
}

/** The yearly returns, from today to about four months ahead. */
export function upcomingReturns(today: string): Deadline[] {
  const y = Number(today.slice(0, 4));
  const all: Deadline[] = [];
  for (const yr of [y - 1, y, y + 1]) {
    all.push(
      { date: `${yr}-01-31`, title: "TDS return, quarter 3 (24Q)", detail: `Salary tax deducted October to December ${yr - 1}.` },
      { date: `${yr}-05-31`, title: "TDS return, quarter 4 (24Q)", detail: `Salary tax deducted January to March ${yr}, with the annual salary details.` },
      { date: `${yr}-06-15`, title: "Form 16 to employees", detail: `Certificate of salary tax deducted in the year ending March ${yr}.` },
      { date: `${yr}-07-31`, title: "TDS return, quarter 1 (24Q)", detail: `Salary tax deducted April to June ${yr}.` },
      { date: `${yr}-10-31`, title: "TDS return, quarter 2 (24Q)", detail: `Salary tax deducted July to September ${yr}.` },
    );
  }
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + 130 * 86_400_000).toISOString().slice(0, 10);
  return all.filter((d) => d.date >= today && d.date <= end).sort((a, b) => a.date.localeCompare(b.date));
}
