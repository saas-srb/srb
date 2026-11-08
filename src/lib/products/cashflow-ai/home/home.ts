import "server-only";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import { listAccounts } from "@/lib/products/cashflow-ai/accounts";
import { listBankAccounts } from "@/lib/products/cashflow-ai/bank-accounts";
import { RAZORPAY_COLLECTIONS_ACCOUNT_NAME } from "@/lib/products/cashflow-ai/payments/payouts";
import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { getComplianceProfile, listFilings } from "@/lib/products/cashflow-ai/compliance/filings";
import { runHealthChecks } from "@/lib/products/cashflow-ai/compliance/health";
import type { HealthCheck } from "@/lib/products/cashflow-ai/compliance/health-core";

/**
 * What the Home page and the hubs show: the few things that need doing now, and the one-time setup steps. Built entirely from checks that
 * already exist, so a number here is never different from the same number on its own page. Anything that cannot be read is left out, not guessed.
 */
export interface SetupStep {
  key: string;
  title: string;
  why: string;
  href: string;
  done: boolean;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function loadSetupSteps(): Promise<SetupStep[]> {
  const [company, accounts, banks, accrual, profile, filings] = await Promise.all([
    safe(() => getCompanyDetails()),
    safe(() => listAccounts()),
    safe(() => listBankAccounts({ status: "active" })),
    safe(async () => ({ on: !!(await getAccrualSettings()) })),
    safe(() => getComplianceProfile()),
    safe(() => listFilings()),
  ]);
  const steps: SetupStep[] = [
    { key: "company", title: "Add your company's GSTIN and state", why: "GST needs them to tell CGST + SGST from IGST. Skip if you are not registered.", href: "/talentos/settings", done: !!company && (!!company.gstin || !!company.state) },
    { key: "accounts", title: "Set up the chart of accounts", why: "The list of heads your money is recorded under. One click adds the standard list.", href: "/cashflow-ai/settings/accounts", done: !accounts || accounts.length > 0 },
    { key: "bank", title: "Add your bank account", why: "So receipts, payments and bank statements have a place to land.", href: "/cashflow-ai/bank-accounts", done: !banks || banks.some((b) => b.accountName !== RAZORPAY_COLLECTIONS_ACCOUNT_NAME && b.accountName !== "RazorpayX balance") },
    { key: "accrual", title: "Record sales and bills when they are raised", why: "A company's books must show what customers owe and what you owe, not only money received and paid.", href: "/cashflow-ai/settings/accrual", done: accrual ? accrual.on : true },
    { key: "profile", title: "Tell us about your company", why: "Four yes/no questions (GST? employees? TDS? company?) so we show only the filings that apply to you. No rates to enter: the law's figures are kept up to date for you.", href: "/cashflow-ai/compliance/calendar", done: !profile || Object.values(profile).every((v) => v !== null) },
    { key: "calendar", title: "Fill in your filing calendar", why: "One tap fills every return and payment of the year with its due date, so nothing is missed.", href: "/cashflow-ai/compliance/calendar", done: !filings || filings.length > 0 },
  ];
  return steps;
}

export interface AttentionItem {
  key: string;
  level: HealthCheck["level"];
  title: string;
  detail: string;
  href?: string;
}

const ORDER: Record<string, number> = { bad: 0, warn: 1, unknown: 2, ok: 3 };

/** The checks that are not fine, worst first. */
export async function loadAttention(today: string, limit = 6): Promise<{ items: AttentionItem[]; allChecked: number }> {
  const checks = (await safe(() => runHealthChecks(today))) ?? [];
  const items = checks
    .filter((c) => c.level !== "ok")
    .sort((a, b) => ORDER[a.level] - ORDER[b.level])
    .map((c) => ({ key: c.key, level: c.level, title: c.label, detail: c.detail, href: c.href }));
  return { items: items.slice(0, limit), allChecked: checks.length };
}

export async function loadHealthByKey(today: string): Promise<Map<string, HealthCheck>> {
  const checks = (await safe(() => runHealthChecks(today))) ?? [];
  return new Map(checks.map((c) => [c.key, c]));
}
