import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { HubGrid, type HubCard } from "@/components/products/cashflow-ai/home/HomeCards";
import { loadHealthByKey } from "@/lib/products/cashflow-ai/home/home";
import { listSettlements } from "@/lib/products/cashflow-ai/payments/settlements";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";

export default async function BankingHub() {
  const [health, settlements] = await Promise.all([loadHealthByKey(istToday()), listSettlements().catch(() => null)]);
  const lines = health.get("bank-lines");
  const toBook = settlements ? settlements.filter((s) => s.status === "ready" || s.status === "review").length : null;
  const cards: HubCard[] = [
    { href: "/cashflow-ai/bank-reconciliation", title: "Match my bank statement", help: "Tick off each line of your bank statement against what you recorded, so the bank and your books agree.", status: lines ? { text: lines.detail, level: lines.level } : null },
    { href: "/cashflow-ai/settlements", title: "Razorpay payouts to my bank", help: "Razorpay pays your customers' money to your bank after taking its fee. Check and record each settlement.", status: toBook === null ? null : toBook === 0 ? { text: "Nothing waiting.", level: "ok" } : { text: `${toBook} settlement${toBook === 1 ? "" : "s"} waiting to be recorded.`, level: "warn" } },
    { href: "/cashflow-ai/transactions", title: "All money in and out", help: "Every rupee that came in or went out, with search and filters." },
    { href: "/cashflow-ai/bank-accounts", title: "My bank accounts", help: "The accounts your company uses, and their balances.", more: [{ label: "Transfer between accounts", href: "/cashflow-ai/transfers" }] },
    { href: "/cashflow-ai/cash-accounts", title: "Cash in hand", help: "Petty cash and cash boxes.", more: [{ label: "Count the cash", href: "/cashflow-ai/cash-reconciliation" }] },
    { href: "/cashflow-ai/beneficiaries", title: "Who I pay (bank details)", help: "Vendors', employees' and others' bank details, kept safe. Changes need a second person to confirm." },
  ];
  return (
    <div className="space-y-4">
      <PanelPageHeader breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Bank & cash" }]} title={<>Bank &amp; Cash</>} description={<>Where your money sits and how it moved. Start with “Match my bank statement”: if it is clear, your books agree with the bank.</>} />
      <HubGrid cards={cards} />
    </div>
  );
}
