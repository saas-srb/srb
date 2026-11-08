/**
 * Salary structure helpers (pure): turning what is stored for an employee into the components the payroll engine takes, and splitting an annual
 * cost to company (CTC) into basic, HRA, special allowance and the employer's contributions.
 */
import type { PayrollStructure, StructureComponent } from "@/lib/products/talentos/payroll/compute";
import type { StatutoryRates } from "@/lib/products/talentos/payroll/rates";
import { gratuityMonthlyProvision } from "@/lib/products/talentos/payroll/statutory";

/** A component as stored: a name and a monthly amount, with how it counts for statutory purposes (a missing flag takes the default). */
export interface StoredComponent {
  name: string;
  amount: number;
  /** Taxable salary (default true). A reimbursement against bills is not. */
  taxable?: boolean;
  /** Counts as PF wages (default false; basic and dearness allowance always do). */
  pf?: boolean;
  /** Counts as ESI wages (default true). */
  esi?: boolean;
  /** Paid in proportion to the days paid (default true). */
  prorate?: boolean;
}

export interface StoredStructure {
  basic: number;
  /** Dearness allowance. */
  da?: number;
  hra: number;
  allowances: StoredComponent[];
  deductions: { name: string; amount: number }[];
  /** The employer's NPS contribution per month. */
  employerNps?: number;
}

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "COMP";

export function toPayrollStructure(s: StoredStructure): PayrollStructure {
  const components: StructureComponent[] = [];
  const add = (c: StructureComponent) => {
    if (c.amount > 0 || c.kind === "basic") components.push(c);
  };
  add({ code: "BASIC", name: "Basic", amount: s.basic, kind: "basic", taxable: true, pf: true, esi: true, prorate: true });
  add({ code: "DA", name: "Dearness allowance", amount: s.da ?? 0, kind: "da", taxable: true, pf: true, esi: true, prorate: true });
  add({ code: "HRA", name: "HRA", amount: s.hra, kind: "hra", taxable: true, pf: false, esi: true, prorate: true });
  const seen = new Set<string>(["BASIC", "DA", "HRA"]);
  s.allowances.forEach((a, i) => {
    let code = slug(a.name);
    if (seen.has(code)) code = `${code}_${i + 1}`;
    seen.add(code);
    add({ code, name: a.name, amount: a.amount, kind: a.taxable === false && a.esi === false ? "reimbursement" : "allowance", taxable: a.taxable ?? true, pf: a.pf ?? false, esi: a.esi ?? true, prorate: a.prorate ?? true });
  });
  return { components, fixedDeductions: s.deductions.filter((d) => d.amount > 0), employerNps: s.employerNps ?? 0 };
}

/** Fixed monthly gross of a stored structure. */
export function storedGross(s: Pick<StoredStructure, "basic" | "da" | "hra" | "allowances">): number {
  return s.basic + (s.da ?? 0) + s.hra + s.allowances.reduce((n, a) => n + a.amount, 0);
}

export interface CtcInput {
  annualCtc: number;
  /** Basic as a share of CTC (the usual 40% to 50%). */
  basicPercentOfCtc: number;
  /** HRA as a share of basic (50% in metros, 40% elsewhere is the tax-friendly rule). */
  hraPercentOfBasic: number;
  /** Other fixed allowances to carry as they are (conveyance, medical ...), per month. */
  otherAllowances: StoredComponent[];
  /** PF on the ceiling or on the full basic. */
  pfMode: "ceiling" | "actual";
  /** Employer NPS as a share of basic. */
  employerNpsPercent: number;
  /** Count the employer's gratuity provision and EDLI/administration charges inside the CTC. */
  includeGratuity: boolean;
  includeEdliAndAdmin: boolean;
  /** Group insurance or other fixed employer cost, per month. */
  employerOtherCostMonthly: number;
  rates: StatutoryRates;
}

export interface CtcBreakup {
  monthlyCtc: number;
  basic: number;
  hra: number;
  specialAllowance: number;
  otherAllowances: StoredComponent[];
  gross: number;
  employerPf: number;
  employerEsi: number;
  edliAndAdmin: number;
  gratuity: number;
  employerNps: number;
  employerOther: number;
  /** What is left for the special allowance is negative: the CTC is too low for these percentages. */
  feasible: boolean;
}

/**
 * Splits a CTC the way payroll teams do: basic and HRA by percentage, the employer's statutory contributions taken off the top, and the rest
 * as a special allowance so that gross + employer contributions equals the CTC exactly.
 */
export function buildFromCtc(i: CtcInput): CtcBreakup {
  const monthlyCtc = Math.round(i.annualCtc / 12);
  const basic = Math.round((monthlyCtc * i.basicPercentOfCtc) / 100);
  const hra = Math.round((basic * i.hraPercentOfBasic) / 100);
  const pf = i.rates.providentFund;
  const pfBase = i.pfMode === "ceiling" ? Math.min(basic, pf.wageCeiling) : basic;
  const employerPf = Math.round((pfBase * pf.employerTotalPercent) / 100);
  const edliAndAdmin = i.includeEdliAndAdmin ? Math.round((Math.min(basic, pf.edliWageCeiling) * pf.edliPercent) / 100) + Math.round((pfBase * pf.adminPercent) / 100) : 0;
  const gratuity = i.includeGratuity ? gratuityMonthlyProvision(basic, i.rates.gratuity) : 0;
  const employerNps = Math.round((basic * i.employerNpsPercent) / 100);
  const others = i.otherAllowances.reduce((n, a) => n + a.amount, 0);
  const fixedCost = employerPf + edliAndAdmin + gratuity + employerNps + i.employerOtherCostMonthly;

  // Employer ESI is a share of gross wages, and applies only when gross is within the threshold: solve both cases.
  const esiRate = i.rates.esi.employerPercent / 100;
  let gross = monthlyCtc - fixedCost;
  let employerEsi = 0;
  if (gross <= i.rates.esi.wageThreshold) {
    gross = Math.round((monthlyCtc - fixedCost) / (1 + esiRate));
    employerEsi = Math.ceil(gross * esiRate - 1e-9);
    gross = monthlyCtc - fixedCost - employerEsi;
  }
  const specialAllowance = gross - basic - hra - others;
  return { monthlyCtc, basic, hra, specialAllowance, otherAllowances: i.otherAllowances, gross, employerPf, employerEsi, edliAndAdmin, gratuity, employerNps, employerOther: i.employerOtherCostMonthly, feasible: specialAllowance >= 0 };
}
