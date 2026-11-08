import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { HubGrid, type HubCard } from "@/components/products/cashflow-ai/home/HomeCards";
import { loadHealthByKey } from "@/lib/products/cashflow-ai/home/home";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { computeProgress } from "@/lib/products/cashflow-ai/compliance/catalog";
import { listItemStates } from "@/lib/products/cashflow-ai/compliance/tracker";

export default async function ClosingHub() {
  const [health, states] = await Promise.all([loadHealthByKey(istToday()), listItemStates().catch(() => null)]);
  const pick = (key: string): HubCard["status"] => {
    const c = health.get(key);
    return c ? { text: c.detail, level: c.level } : null;
  };
  let checklist: HubCard["status"] = null;
  if (states) {
    const p = computeProgress(new Map([...states].map(([k, v]) => [k, v.status])));
    const applicable = p.reduce((n, x) => n + x.applicable, 0);
    const done = p.reduce((n, x) => n + x.done, 0);
    checklist = { text: `${done} of ${applicable} jobs done.`, level: applicable > 0 && done === applicable ? "ok" : "unknown" };
  }
  const cards: HubCard[] = [
    { href: "/cashflow-ai/month-close", title: "Close the month", help: "A short list to follow at month-end. When it is clear, lock the month so nothing changes behind your back.", status: pick("periods") },
    { href: "/cashflow-ai/compliance/calendar", title: "Filing calendar", help: "Every return and payment with its date, who is doing it, and the proof it was filed.", status: pick("filings") },
    { href: "/cashflow-ai/compliance/checklist", title: "What my CA expects", help: "The full list of jobs a company must do through the year, ticked off as you go.", status: checklist, more: [{ label: "Who does what", href: "/cashflow-ai/compliance/team" }, { label: "Overview", href: "/cashflow-ai/compliance" }] },
    { href: "/cashflow-ai/compliance/cleanup", title: "Fix missing bills & duplicates", help: "Bills without a copy, the same bill entered twice, entries with no account.", status: pick("cleanup") },
    { href: "/cashflow-ai/party-reconciliation", title: "Do my customers and vendors agree?", help: "A statement for each customer and vendor, to agree balances with them.", status: pick("receivables") },
    { href: "/cashflow-ai/vendor-controls", title: "Safe vendor payments", help: "Changed bank details wait for a second person to confirm; MSME dues; advances paid to vendors.", status: pick("payables") },
  ];
  return (
    <div className="space-y-4">
      <PanelPageHeader breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Month & year-end" }]} title={<>Month &amp; Year-end</>} description={<>What to do at the end of every month and every year so your books are ready for your CA and the auditor. Go top to bottom.</>} />
      <p className="text-sm text-muted-foreground">Prefer to be told what to do each month? <Link href="/cashflow-ai/work" className="font-medium text-primary hover:underline">Open My work</Link></p>
      <HubGrid cards={cards} />
    </div>
  );
}
