import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { HubGrid, type HubCard } from "@/components/products/cashflow-ai/home/HomeCards";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { loadGstr3b } from "@/lib/products/cashflow-ai/gst/store";
import { loadDeductions } from "@/lib/products/cashflow-ai/tds/store";
import { loadYearComputation } from "@/lib/products/cashflow-ai/income-tax/store";
import { financialYearOf } from "@/lib/products/cashflow-ai/tds/core";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export default async function TaxesHub() {
  const today = istToday();
  const [y, m] = today.split("-").map(Number);
  const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const fy = financialYearOf(today);
  const [gst, tds, it] = await Promise.all([safe(() => loadGstr3b(lastMonth)), safe(() => loadDeductions(fy)), safe(() => loadYearComputation(fy))]);

  const gstStatus: HubCard["status"] = !gst ? null : !gst.registration.gstin ? { text: "Add your company's GSTIN first (Get started on Home).", level: "warn" }
    : gst.working.itc.toReviewBills + gst.working.flaggedInvoices + gst.working.flaggedBills > 0
      ? { text: `${gst.working.itc.toReviewBills} bill${gst.working.itc.toReviewBills === 1 ? "" : "s"} to decide, ${gst.working.flaggedInvoices + gst.working.flaggedBills} to fix, for last month.`, level: "warn" }
      : { text: "Last month's GST is ready for your CA.", level: "ok" };
  const flagged = tds ? tds.all.filter((r) => r.flags.some((f) => f !== "numbers_unconfirmed")).length : 0;
  const tdsStatus: HubCard["status"] = !tds ? null : tds.all.length === 0 ? { text: "No tax cut from payments yet.", level: "unknown" } : flagged > 0 ? { text: `${flagged} bill${flagged === 1 ? "" : "s"} to look at.`, level: "warn" } : { text: "Nothing to fix.", level: "ok" };
  const itStatus: HubCard["status"] = !it ? null : it.result.notes.includes("rates_not_entered") ? { text: "Rates for this year not entered yet. Your CA gives them.", level: "unknown" } : it.result.balance === null ? null : { text: it.result.balance >= 0 ? `About ${formatMoney(it.result.balance)} still to pay for this year.` : `About ${formatMoney(-it.result.balance)} refund due for this year.`, level: "ok" };

  const cards: HubCard[] = [
    { href: "/cashflow-ai/gst", title: "GST", help: "Each month: the tax on your sales, the credit on your purchases, and what is left. Ready to hand to your CA.", status: gstStatus, more: [{ label: "Sales", href: "/cashflow-ai/gst/sales" }, { label: "Purchases & credit", href: "/cashflow-ai/gst/purchases" }, { label: "Match with GSTR-2B", href: "/cashflow-ai/gst/reconcile" }] },
    { href: "/cashflow-ai/tds", title: "TDS (tax you cut from payments)", help: "Check the tax cut from vendor payments, note each deposit, and get the quarter's statement ready.", status: tdsStatus, more: [{ label: "Deposits", href: "/cashflow-ai/tds/challans" }, { label: "Quarterly statement", href: "/cashflow-ai/tds/statement" }, { label: "Certificates", href: "/cashflow-ai/tds/certificates" }, { label: "TDS cut by customers", href: "/cashflow-ai/tds/credits" }] },
    { href: "/cashflow-ai/income-tax", title: "Income tax for the year", help: "Your profit, the changes your CA asks for, and the tax that comes to — with what you have already paid.", status: itStatus, more: [{ label: "Advance tax", href: "/cashflow-ai/income-tax/advance-tax" }, { label: "Losses", href: "/cashflow-ai/income-tax/losses" }, { label: "Return & notices", href: "/cashflow-ai/income-tax/returns" }] },
  ];
  return (
    <div className="space-y-4">
      <PanelPageHeader breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Taxes" }]} title={<>Taxes</>} description={<>GST, TDS and income tax in one place. These pages prepare the numbers; your CA files the returns. Rates and dates come from your CA — none are assumed.</>} />
      <p className="text-sm text-muted-foreground">Prefer to be told what to do each month? <Link href="/cashflow-ai/work" className="font-medium text-primary hover:underline">Open My work</Link></p>
      <HubGrid cards={cards} />
    </div>
  );
}
