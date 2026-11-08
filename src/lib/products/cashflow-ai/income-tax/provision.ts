import "server-only";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { getAccountByCode, createAccount } from "@/lib/products/cashflow-ai/accounts";
import { liveDocumentEntry } from "@/lib/products/cashflow-ai/journal";
import { applyDocumentEntry } from "@/lib/products/cashflow-ai/accrual/posting";
import { dayOf, ENGINE_ACCOUNTS, istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { fyRange, isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { loadYearComputation } from "@/lib/products/cashflow-ai/income-tax/store";

/**
 * The tax the year's working comes to, put into the books as a provision: Dr Income tax expense / Cr Provision for income tax. It uses
 * the rulebook's figures once the platform has confirmed them (or the company's own rates, if it confirmed those), posted only on request, and re-posted in place if the
 * working changes. Paying the tax later (advance tax, TDS credit) is settled against this provision by the CA's own journal.
 */
type Actor = { id: string; email: string | null };

async function accountId(def: { code: string; name: string; type: "expense" | "liability" }, actor: Actor): Promise<{ _id: string; code: string; name: string }> {
  const existing = await getAccountByCode(def.code);
  if (existing) return { _id: existing._id, code: existing.code, name: existing.name };
  try {
    const made = await createAccount({ code: def.code, name: def.name, type: def.type, parentId: null, description: "Used for the income-tax provision.", isActive: true }, actor.id);
    return { _id: made._id, code: made.code, name: made.name };
  } catch {
    const again = await getAccountByCode(def.code);
    if (again) return { _id: again._id, code: again.code, name: again.name };
    throw new Error(`Could not create the ${def.name} account.`);
  }
}

export interface ProvisionState {
  /** What the working says the tax for the year is (null while a rate is missing). */
  computed: number | null;
  /** What is in the books now (0 when nothing is posted). */
  posted: number;
  ratesConfirmed: boolean;
}

export async function provisionState(fy: string): Promise<ProvisionState> {
  const c = await loadYearComputation(fy);
  const live = await liveDocumentEntry("income_tax_provision", fy);
  let posted = 0;
  if (live) {
    const { linesForEntry } = await import("@/lib/products/cashflow-ai/journal");
    const lines = await linesForEntry(live._id);
    posted = lines.filter((l) => l.accountCode === ENGINE_ACCOUNTS.taxProvision.code && l.side === "credit").reduce((n, l) => n + l.amount, 0);
  }
  return { computed: c.result.taxForYear?.total ?? null, posted: Math.round(posted * 100) / 100, ratesConfirmed: c.rates.confirmed };
}

export async function postProvision(fy: string, actor: Actor): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  if (!isFinancialYear(fy)) return { ok: false, error: "Choose a financial year." };
  const c = await loadYearComputation(fy);
  if (!c.rates.confirmed) return { ok: false, error: c.ratesFrom === "rulebook" ? "The platform has not yet checked this year's tax figures, so the tax cannot be put into the books yet." : c.ratesFrom === "none" ? "Choose the tax basis your company pays under before putting the tax into the books." : "Mark the year's rates as confirmed before putting the tax into the books." };
  const total = c.result.taxForYear?.total;
  if (total === undefined) return { ok: false, error: "The tax for the year cannot be worked out yet: a rate is missing." };
  const [expense, provision] = await Promise.all([accountId(ENGINE_ACCOUNTS.taxExpense, actor), accountId(ENGINE_ACCOUNTS.taxProvision, actor)]);
  const { to } = fyRange(fy);
  // An entry already in the books keeps its date, so updating the amount does not move it (or churn the ledger) from one day to the next.
  const live = await liveDocumentEntry("income_tax_provision", fy);
  const date = live ? dayOf(live.entryDate) : to > istToday() ? istToday() : to;
  const r = await applyDocumentEntry(
    "income_tax_provision",
    fy,
    total > 0
      ? { date, description: `Provision for income tax, FY ${fy}`, currency: "INR", lines: [{ account: expense, side: "debit", amount: total }, { account: provision, side: "credit", amount: total }] }
      : null,
    actor
  );
  if (!r.ok) return r;
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "settings", entityId: `it:${fy}`, entityLabel: `Income tax ${fy}`, summary: total > 0 ? `tax provision posted: ${total}` : "tax provision taken out (nothing due)" });
  return { ok: true, amount: total };
}

export async function removeProvision(fy: string, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isFinancialYear(fy)) return { ok: false, error: "Choose a financial year." };
  const r = await applyDocumentEntry("income_tax_provision", fy, null, actor);
  if (!r.ok) return r;
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "reverse", entity: "settings", entityId: `it:${fy}`, entityLabel: `Income tax ${fy}`, summary: "tax provision taken out of the books" });
  return { ok: true };
}
