import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivateAccrualForm, PostMissingButton } from "@/components/products/cashflow-ai/AccrualControls";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { redirect } from "next/navigation";
import { listAccountOptions } from "@/lib/products/cashflow-ai/accounts";
import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { accrualTieOut, countMissingAccruals } from "@/lib/products/cashflow-ai/accrual/engine";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

const d = (s: string) => s.split("-").reverse().join("-");

export default async function CashflowAiSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");

  const settings = await getAccrualSettings();
  const [income, expense, tie, missing] = await Promise.all([
    settings ? [] : listAccountOptions({ type: "income", activeOnly: true }),
    settings ? [] : listAccountOptions({ type: "expense", activeOnly: true }),
    accrualTieOut(),
    countMissingAccruals(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "CashFlow AI" },
        ]}
        title={<>CashFlow AI Settings</>}
        description={<>A company&apos;s books must record a sale when the invoice is raised and a cost when the bill is entered, not only when money moves. Switch this on to do that: customers&apos; and vendors&apos; balances, GST and TDS then show in the ledger and the balance sheet.</>}
      />

      {!settings && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Not switched on</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>Today the ledger records income and expense only when money is received or paid. When you switch accrual books on:</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>It starts <strong className="text-foreground">today</strong>. Earlier entries stay exactly as they are.</li>
              <li>What customers still owe on invoices already issued, and what you still owe vendors on bills already entered, are brought in as <strong className="text-foreground">opening balances</strong> against &quot;Opening balance equity&quot;. Your CA moves that to the right place.</li>
              <li>From then on, an invoice posts receivable, revenue and GST; a vendor bill posts cost, GST input credit, payable and TDS; receipts and vendor payments settle those balances.</li>
              <li>Refunds, salaries and employee expense claims are not changed by this.</li>
              <li>Invoices and bills that were already issued cannot change amount afterwards (use a credit or debit note).</li>
            </ul>
            <ActivateAccrualForm
              incomeAccounts={income.map((a) => ({ id: a._id, label: `${a.code} — ${a.name}` }))}
              expenseAccounts={expense.map((a) => ({ id: a._id, label: `${a.code} — ${a.name}` }))}
            />
          </CardContent>
        </GlassCard>
      )}

      {settings && (
        <>
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>On since {d(settings.startDate)}</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>Opening receivable brought in: <strong>{formatMoney(settings.openingReceivable)}</strong></p>
              <p>Opening payable brought in: <strong>{formatMoney(settings.openingPayable)}</strong></p>
              <p className="text-xs text-muted-foreground">Both sit against &quot;Opening balance equity&quot;. Other opening balances (fixed assets, loans, share capital, GST and TDS already due) are not worked out by the system: your CA adds them.</p>
            </CardContent>
          </GlassCard>

          {tie && (
            <GlassCard interactive={false}>
              <CardHeader><CardTitle>Do the books agree with the records?</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  { name: "Receivable (what customers owe)", t: tie.receivable },
                  { name: "Payable (what you owe vendors)", t: tie.payable },
                ].map(({ name, t }) => (
                  <div key={name} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground">Ledger {formatMoney(t.ledger)} · Records {formatMoney(t.records)}</span>
                    <span className={Math.abs(t.difference) < 0.01 ? "text-green-700 dark:text-green-400" : "font-semibold text-destructive"}>
                      {Math.abs(t.difference) < 0.01 ? "Agrees" : `Difference ${formatMoney(t.difference)}`}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">A difference usually means a document that has not been posted yet (see below), a vendor advance recorded but not yet booked, or an entry made by hand straight to Receivable / Payable.</p>
              </CardContent>
            </GlassCard>
          )}

          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Documents not yet in the ledger: {missing ?? 0}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">{missing ? "Invoices, bills or notes that could not be posted when they were raised (for example the date was in a closed period)." : "Every invoice, bill and note is in the ledger."}</span>
              {missing ? <PostMissingButton /> : null}
            </CardContent>
          </GlassCard>
        </>
      )}
    </div>
  );
}
