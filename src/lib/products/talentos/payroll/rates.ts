/**
 * Statutory rates for Indian payroll (pure: no I/O, safe for client components).
 *
 * These are the numbers the law sets (income-tax slabs, provident fund, ESI, professional tax, gratuity, bonus). They are NOT company
 * settings: a company cannot choose its own PF rate. They live here as the built-in defaults, and the Platform Console can publish a newer
 * version with an effective date (see `rates-store.ts`) so a change in the law reaches every company without a deployment.
 *
 * Every table carries `confirmed`. A built-in table that this code only assumes (for example a new financial year whose slabs have not been
 * verified against the Finance Act yet, or a state's professional-tax slabs) is `confirmed: false`: payroll still runs on it, but every
 * payroll run shows "not yet confirmed" until a platform administrator checks the figures against the notification and confirms them.
 */

// ── Income tax ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TaxSlab {
  /** Upper bound of the band (inclusive); `null` = no upper bound. */
  upTo: number | null;
  /** Rate as a percentage. */
  rate: number;
}

export interface SurchargeBand {
  /** Surcharge applies when total income exceeds this. */
  above: number;
  /** Percentage of income tax. */
  rate: number;
}

export interface TaxRebate {
  /** Rebate under section 87A (section 156 of the Income-tax Act, 2025) applies when total income is at most this. */
  incomeLimit: number;
  /** The most the rebate can be. */
  maxRebate: number;
  /** Above the limit, tax is capped at the income above the limit (marginal relief). */
  marginalRelief: boolean;
}

export interface IncomeTaxYear {
  /** "2025-26": the financial year (tax year) starting on 1 April 2025. */
  fy: string;
  confirmed: boolean;
  /** Where the figures come from, shown next to the confirm button. */
  source: string;
  cessPercent: number;
  newRegime: {
    slabs: TaxSlab[];
    standardDeduction: number;
    rebate: TaxRebate;
    surcharge: SurchargeBand[];
    /** The highest surcharge rate this regime can attract (the new regime is capped). */
    maxSurchargePercent: number;
    /** Employer NPS contribution allowed as a deduction, as a percentage of basic + DA (section 80CCD(2)). */
    employerNpsPercent: number;
  };
  oldRegime: {
    /** Slabs by age on the last day of the year: under 60, 60 to 79, 80 and over. */
    slabs: { general: TaxSlab[]; senior: TaxSlab[]; superSenior: TaxSlab[] };
    standardDeduction: number;
    rebate: TaxRebate;
    surcharge: SurchargeBand[];
    maxSurchargePercent: number;
    employerNpsPercent: number;
  };
  /** Limits for the deductions an employee can declare under the old regime (and 80CCD(2) under both). */
  limits: {
    section80C: number;
    section80CCD1B: number;
    section80D: { self: number; selfSenior: number; parents: number; parentsSenior: number; preventiveHealthCheck: number };
    section80TTA: number;
    section80TTB: number;
    homeLoanInterestSelfOccupied: number;
    section80DD: { normal: number; severe: number };
    section80U: { normal: number; severe: number };
    section80DDB: { normal: number; senior: number };
    /** Employer contributions to PF + NPS + superannuation above this, in a year, are taxable (section 17(2)(vii)). */
    employerFundsExempt: number;
    /** HRA: percentage of basic + DA for the cap in metro and non-metro cities. */
    hraMetroPercent: number;
    hraNonMetroPercent: number;
    /** HRA: rent paid minus this percentage of basic + DA. */
    hraRentExcessPercent: number;
    /** The year's rent above which the landlord's PAN is needed. */
    rentPanThreshold: number;
  };
}

const OLD_GENERAL: TaxSlab[] = [
  { upTo: 250000, rate: 0 },
  { upTo: 500000, rate: 5 },
  { upTo: 1000000, rate: 20 },
  { upTo: null, rate: 30 },
];
const OLD_SENIOR: TaxSlab[] = [
  { upTo: 300000, rate: 0 },
  { upTo: 500000, rate: 5 },
  { upTo: 1000000, rate: 20 },
  { upTo: null, rate: 30 },
];
const OLD_SUPER_SENIOR: TaxSlab[] = [
  { upTo: 500000, rate: 0 },
  { upTo: 1000000, rate: 20 },
  { upTo: null, rate: 30 },
];

const OLD_SURCHARGE: SurchargeBand[] = [
  { above: 5000000, rate: 10 },
  { above: 10000000, rate: 15 },
  { above: 20000000, rate: 25 },
  { above: 50000000, rate: 37 },
];
const NEW_SURCHARGE: SurchargeBand[] = [
  { above: 5000000, rate: 10 },
  { above: 10000000, rate: 15 },
  { above: 20000000, rate: 25 },
];

const LIMITS: IncomeTaxYear["limits"] = {
  section80C: 150000,
  section80CCD1B: 50000,
  section80D: { self: 25000, selfSenior: 50000, parents: 25000, parentsSenior: 50000, preventiveHealthCheck: 5000 },
  section80TTA: 10000,
  section80TTB: 50000,
  homeLoanInterestSelfOccupied: 200000,
  section80DD: { normal: 75000, severe: 125000 },
  section80U: { normal: 75000, severe: 125000 },
  section80DDB: { normal: 40000, senior: 100000 },
  employerFundsExempt: 750000,
  hraMetroPercent: 50,
  hraNonMetroPercent: 40,
  hraRentExcessPercent: 10,
  rentPanThreshold: 100000,
};

/** New regime, Finance Act 2025 (FY 2025-26): nil to 4 lakh, then 5/10/15/20/25/30 per cent; rebate up to 60,000 for income up to 12 lakh. */
const NEW_2025: IncomeTaxYear["newRegime"] = {
  slabs: [
    { upTo: 400000, rate: 0 },
    { upTo: 800000, rate: 5 },
    { upTo: 1200000, rate: 10 },
    { upTo: 1600000, rate: 15 },
    { upTo: 2000000, rate: 20 },
    { upTo: 2400000, rate: 25 },
    { upTo: null, rate: 30 },
  ],
  standardDeduction: 75000,
  rebate: { incomeLimit: 1200000, maxRebate: 60000, marginalRelief: true },
  surcharge: NEW_SURCHARGE,
  maxSurchargePercent: 25,
  employerNpsPercent: 14,
};

/** New regime, FY 2024-25: nil to 3 lakh, then 5/10/15/20/30; rebate up to 25,000 for income up to 7 lakh. */
const NEW_2024: IncomeTaxYear["newRegime"] = {
  slabs: [
    { upTo: 300000, rate: 0 },
    { upTo: 700000, rate: 5 },
    { upTo: 1000000, rate: 10 },
    { upTo: 1200000, rate: 15 },
    { upTo: 1500000, rate: 20 },
    { upTo: null, rate: 30 },
  ],
  standardDeduction: 75000,
  rebate: { incomeLimit: 700000, maxRebate: 25000, marginalRelief: true },
  surcharge: NEW_SURCHARGE,
  maxSurchargePercent: 25,
  employerNpsPercent: 14,
};

const OLD_REGIME = {
  slabs: { general: OLD_GENERAL, senior: OLD_SENIOR, superSenior: OLD_SUPER_SENIOR },
  standardDeduction: 50000,
  rebate: { incomeLimit: 500000, maxRebate: 12500, marginalRelief: false },
  surcharge: OLD_SURCHARGE,
  maxSurchargePercent: 37,
  employerNpsPercent: 10,
};

export const BUILTIN_INCOME_TAX: IncomeTaxYear[] = [
  {
    fy: "2024-25",
    confirmed: true,
    source: "Finance (No. 2) Act, 2024 (section 115BAC and section 115BAC(1A) as amended)",
    cessPercent: 4,
    newRegime: NEW_2024,
    oldRegime: OLD_REGIME,
    limits: LIMITS,
  },
  {
    fy: "2025-26",
    confirmed: true,
    source: "Finance Act, 2025 (section 115BAC as amended)",
    cessPercent: 4,
    newRegime: NEW_2025,
    oldRegime: OLD_REGIME,
    limits: LIMITS,
  },
  {
    // The Income-tax Act, 2025 replaces the 1961 Act from 1 April 2026 (tax year 2026-27). The slabs here are carried over from FY 2025-26 and
    // MUST be checked against the Finance Act in force before the first payroll of the year; until a platform administrator confirms them,
    // every payroll run says so.
    fy: "2026-27",
    confirmed: false,
    source: "Carried over from FY 2025-26. Check against the Income-tax Act, 2025 and the Finance Act for the year, then confirm.",
    cessPercent: 4,
    newRegime: NEW_2025,
    oldRegime: OLD_REGIME,
    limits: LIMITS,
  },
];

// ── Provident fund, ESI, EDLI ──────────────────────────────────────────────────────────────────────────────────────────────

export interface ProvidentFundRates {
  confirmed: boolean;
  source: string;
  /** Employee contribution, % of PF wages. */
  employeePercent: number;
  /** Employer's pension (EPS) share, % of PF wages (capped at `epsWageCeiling`). */
  epsPercent: number;
  /** The employer pays the same total (12%) as the employee; the part beyond EPS goes to the EPF account. */
  employerTotalPercent: number;
  /** PF wages above this are ignored unless the employee/employer contribute on actual wages. */
  wageCeiling: number;
  /** EPS is paid only on wages up to this. */
  epsWageCeiling: number;
  /** EDLI: employer pays this % of PF wages (capped at `edliWageCeiling`). */
  edliPercent: number;
  edliWageCeiling: number;
  /** EPFO administration charge, % of PF wages, and the lowest amount payable per establishment per month. */
  adminPercent: number;
  adminMinimum: number;
}

export interface EsiRates {
  confirmed: boolean;
  source: string;
  employeePercent: number;
  employerPercent: number;
  /** An employee whose monthly wages are at most this is covered. */
  wageThreshold: number;
  /** The same, for a person with disability. */
  wageThresholdDisabled: number;
  /** An employee earning at most this per day pays no contribution (the employer still pays). */
  dailyWageExemption: number;
}

export interface GratuityRates {
  confirmed: boolean;
  source: string;
  /** Days of wages per completed year of service. */
  daysPerYear: number;
  /** Days in a month for the calculation (26 for monthly-rated employees). */
  daysInMonth: number;
  /** Completed years of service needed. */
  minYears: number;
  /** A final year of service counts as a full year when it is more than this many months. */
  roundUpAfterMonths: number;
  /** The most a person can be paid, and the tax-exempt limit. */
  maxAmount: number;
  exemptLimit: number;
}

export interface BonusRates {
  confirmed: boolean;
  source: string;
  minPercent: number;
  maxPercent: number;
  /** An employee whose monthly wages are at most this is eligible. */
  eligibilityWageCeiling: number;
  /** Bonus is worked out on wages up to this (or the minimum wage, if higher). */
  calculationWageCeiling: number;
  minDaysWorked: number;
}

export interface LeaveEncashmentRates {
  confirmed: boolean;
  source: string;
  /** The most of leave encashment that is exempt at retirement or resignation (section 10(10AA)). */
  exemptLimit: number;
  /** Months of average salary that cap the exemption. */
  exemptMonthsOfAverageSalary: number;
}

export interface StatutoryRates {
  providentFund: ProvidentFundRates;
  esi: EsiRates;
  gratuity: GratuityRates;
  bonus: BonusRates;
  leaveEncashment: LeaveEncashmentRates;
}

export const BUILTIN_STATUTORY: StatutoryRates = {
  providentFund: {
    confirmed: true,
    source: "Employees' Provident Funds and Miscellaneous Provisions Act, 1952; EPF Scheme 1952; EPS 1995; EDLI Scheme 1976",
    employeePercent: 12,
    epsPercent: 8.33,
    employerTotalPercent: 12,
    wageCeiling: 15000,
    epsWageCeiling: 15000,
    edliPercent: 0.5,
    edliWageCeiling: 15000,
    adminPercent: 0.5,
    adminMinimum: 500,
  },
  esi: {
    confirmed: true,
    source: "Employees' State Insurance Act, 1948 (rates from 1 July 2019)",
    employeePercent: 0.75,
    employerPercent: 3.25,
    wageThreshold: 21000,
    wageThresholdDisabled: 25000,
    dailyWageExemption: 176,
  },
  gratuity: {
    confirmed: true,
    source: "Payment of Gratuity Act, 1972; Code on Social Security, 2020",
    daysPerYear: 15,
    daysInMonth: 26,
    minYears: 5,
    roundUpAfterMonths: 6,
    maxAmount: 2000000,
    exemptLimit: 2000000,
  },
  bonus: {
    confirmed: true,
    source: "Payment of Bonus Act, 1965; Code on Wages, 2019",
    minPercent: 8.33,
    maxPercent: 20,
    eligibilityWageCeiling: 21000,
    calculationWageCeiling: 7000,
    minDaysWorked: 30,
  },
  leaveEncashment: {
    confirmed: true,
    source: "Income-tax Act, section 10(10AA) (limit raised to 25 lakh for non-government employees from 1 April 2023)",
    exemptLimit: 2500000,
    exemptMonthsOfAverageSalary: 10,
  },
};

// ── Professional tax and labour welfare fund ───────────────────────────────────────────────────────────────────────────────

export interface PtSlab {
  /** Monthly (or half-yearly, see `frequency`) wages at least this... */
  from: number;
  /** ...and at most this (`null` = no upper bound). */
  to: number | null;
  /** The tax for the period. */
  amount: number;
  /** A different amount for one month (Maharashtra and Karnataka charge more in February), as "MM". */
  monthAmounts?: Record<string, number>;
}

export interface PtRule {
  /** State or union territory name as used in the employee's address (see `INDIAN_STATES`). */
  state: string;
  /** True: the state charges no professional tax. */
  noTax?: boolean;
  /** "monthly": deducted every month. "half_yearly": deducted in the months listed in `payMonths`, from the half-year's wages. */
  frequency: "monthly" | "half_yearly";
  /** For half-yearly states: the months ("09" and "03" ...) in which the tax is deducted. */
  payMonths?: string[];
  /** Slabs for everyone, or per gender where the state differs (female slabs apply to women). */
  slabs: PtSlab[];
  femaleSlabs?: PtSlab[];
  /** The most a person can be charged in a financial year (Article 276 of the Constitution: 2,500). */
  annualCap: number;
  confirmed: boolean;
  source: string;
}

export const PT_ANNUAL_CAP = 2500;

/**
 * Professional tax slabs. A state's slabs are set by that state's own Act and notifications, change from time to time and are easy to get
 * wrong, so every state below is `confirmed: false` until a platform administrator checks it against the state's current notification. The
 * list covers the states with the most employees; a state that is not listed, or that an administrator has not set up, is reported on the
 * payroll run instead of being guessed.
 */
export const BUILTIN_PT: PtRule[] = [
  {
    state: "Maharashtra",
    frequency: "monthly",
    slabs: [
      { from: 0, to: 7500, amount: 0 },
      { from: 7501, to: 10000, amount: 175 },
      { from: 10001, to: null, amount: 200, monthAmounts: { "02": 300 } },
    ],
    femaleSlabs: [
      { from: 0, to: 25000, amount: 0 },
      { from: 25001, to: null, amount: 200, monthAmounts: { "02": 300 } },
    ],
    annualCap: PT_ANNUAL_CAP,
    confirmed: false,
    source: "Maharashtra State Tax on Professions, Trades, Callings and Employments Act, 1975 (Schedule I)",
  },
  {
    state: "Karnataka",
    frequency: "monthly",
    slabs: [
      { from: 0, to: 24999, amount: 0 },
      { from: 25000, to: null, amount: 200, monthAmounts: { "02": 300 } },
    ],
    annualCap: PT_ANNUAL_CAP,
    confirmed: false,
    source: "Karnataka Tax on Professions, Trades, Callings and Employments Act, 1976",
  },
  {
    state: "West Bengal",
    frequency: "monthly",
    slabs: [
      { from: 0, to: 10000, amount: 0 },
      { from: 10001, to: 15000, amount: 110 },
      { from: 15001, to: 25000, amount: 130 },
      { from: 25001, to: 40000, amount: 150 },
      { from: 40001, to: null, amount: 200 },
    ],
    annualCap: PT_ANNUAL_CAP,
    confirmed: false,
    source: "West Bengal State Tax on Professions, Trades, Callings and Employments Act, 1979",
  },
  {
    state: "Telangana",
    frequency: "monthly",
    slabs: [
      { from: 0, to: 15000, amount: 0 },
      { from: 15001, to: 20000, amount: 150 },
      { from: 20001, to: null, amount: 200 },
    ],
    annualCap: PT_ANNUAL_CAP,
    confirmed: false,
    source: "Telangana Tax on Professions, Trades, Callings and Employments Act, 1987",
  },
  {
    state: "Andhra Pradesh",
    frequency: "monthly",
    slabs: [
      { from: 0, to: 15000, amount: 0 },
      { from: 15001, to: 20000, amount: 150 },
      { from: 20001, to: null, amount: 200 },
    ],
    annualCap: PT_ANNUAL_CAP,
    confirmed: false,
    source: "Andhra Pradesh Tax on Professions, Trades, Callings and Employments Act, 1987",
  },
  {
    state: "Assam",
    frequency: "monthly",
    slabs: [
      { from: 0, to: 10000, amount: 0 },
      { from: 10001, to: 15000, amount: 150 },
      { from: 15001, to: 25000, amount: 180 },
      { from: 25001, to: null, amount: 208 },
    ],
    annualCap: PT_ANNUAL_CAP,
    confirmed: false,
    source: "Assam Professions, Trades, Callings and Employments Taxation Act, 1947",
  },
  // States and union territories that charge no professional tax.
  ...["Delhi", "Haryana", "Rajasthan", "Uttar Pradesh", "Uttarakhand", "Himachal Pradesh", "Goa", "Jammu and Kashmir", "Ladakh", "Chandigarh"].map(
    (state): PtRule => ({ state, noTax: true, frequency: "monthly", slabs: [], annualCap: 0, confirmed: false, source: "No professional tax is levied in this state/union territory" }),
  ),
];

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
  "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
] as const;
export type IndianState = (typeof INDIAN_STATES)[number];

export interface LwfRule {
  state: string;
  /** Contribution months as "MM" (a half-yearly fund is paid in two months). */
  payMonths: string[];
  employee: number;
  employer: number;
  /** Wages at most this are charged (0 = everyone). */
  wageCeiling: number;
  confirmed: boolean;
  source: string;
}

/**
 * Labour welfare fund. State funds differ in who pays, how much and when, and the amounts are revised often, so none is built in: a
 * platform administrator adds the states companies actually operate in. A company that turns the fund on for a state that has no rule gets a
 * clear message on the payroll run rather than a made-up amount.
 */
export const BUILTIN_LWF: LwfRule[] = [];

// ── Resolution ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The financial year ("2025-26") a month ("2026-03") falls in, for a year that starts in April. */
export function financialYearOf(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Months of a financial year in order: April of the start year to March of the next. */
export function monthsOfFy(fy: string): string[] {
  const start = Number(fy.slice(0, 4));
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = ((3 + i) % 12) + 1;
    const y = m >= 4 ? start : start + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

export function incomeTaxFor(fy: string, tables: IncomeTaxYear[] = BUILTIN_INCOME_TAX): IncomeTaxYear {
  const exact = tables.find((t) => t.fy === fy);
  if (exact) return exact;
  // A year without a table uses the closest earlier one and says so (confirmed: false), never a later one.
  const earlier = [...tables].filter((t) => t.fy < fy).sort((a, b) => (a.fy < b.fy ? 1 : -1))[0] ?? tables[tables.length - 1];
  return { ...earlier, fy, confirmed: false, source: `No table for ${fy}; using ${earlier.fy}. Add the year's table in the Platform Console.` };
}

export function ptRuleFor(state: string | null | undefined, rules: PtRule[] = BUILTIN_PT): PtRule | null {
  if (!state) return null;
  const s = state.trim().toLowerCase();
  return rules.find((r) => r.state.toLowerCase() === s) ?? null;
}

/** Matches an employee's free-text state to a known state name ("Maharashtra", "maharashtra ", "MH" …). */
export function normaliseState(input: string | null | undefined): IndianState | null {
  if (!input) return null;
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  const exact = INDIAN_STATES.find((x) => x.toLowerCase() === s);
  if (exact) return exact;
  const codes: Record<string, IndianState> = {
    an: "Andaman and Nicobar Islands", ap: "Andhra Pradesh", ar: "Arunachal Pradesh", as: "Assam", br: "Bihar", ch: "Chandigarh", cg: "Chhattisgarh",
    dd: "Dadra and Nagar Haveli and Daman and Diu", dn: "Dadra and Nagar Haveli and Daman and Diu", dl: "Delhi", ga: "Goa", gj: "Gujarat", hr: "Haryana",
    hp: "Himachal Pradesh", jk: "Jammu and Kashmir", jh: "Jharkhand", ka: "Karnataka", kl: "Kerala", la: "Ladakh", ld: "Lakshadweep", mp: "Madhya Pradesh",
    mh: "Maharashtra", mn: "Manipur", ml: "Meghalaya", mz: "Mizoram", nl: "Nagaland", od: "Odisha", or: "Odisha", py: "Puducherry", pb: "Punjab",
    rj: "Rajasthan", sk: "Sikkim", tn: "Tamil Nadu", ts: "Telangana", tg: "Telangana", tr: "Tripura", up: "Uttar Pradesh", uk: "Uttarakhand", ut: "Uttarakhand", wb: "West Bengal",
  };
  if (codes[s]) return codes[s];
  const alias: Record<string, IndianState> = {
    orissa: "Odisha", pondicherry: "Puducherry", "new delhi": "Delhi", "delhi ncr": "Delhi", uttaranchal: "Uttarakhand", "jammu & kashmir": "Jammu and Kashmir",
    "jammu and kashmir": "Jammu and Kashmir", "andaman & nicobar islands": "Andaman and Nicobar Islands", "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
    "daman and diu": "Dadra and Nagar Haveli and Daman and Diu", "tamilnadu": "Tamil Nadu", "westbengal": "West Bengal", "madhyapradesh": "Madhya Pradesh",
  };
  return alias[s] ?? null;
}
