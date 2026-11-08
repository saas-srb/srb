import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManagePayrollConfig, canRunPayroll } from "@/lib/hrms-roles";
import { getPaymentAccountView } from "@/lib/platform/integrations/payments";
import PaymentAccountManager from "@/components/platform/PaymentAccountManager";
import CompanyBankAccounts from "@/components/products/talentos/CompanyBankAccounts";
import { getPayrollConfig } from "@/lib/products/talentos/payroll-config";
import { payingAccounts, suggestedAccountId } from "@/lib/products/talentos/payroll-bank";
import { getPayoutProvider } from "@/lib/products/talentos/payout-provider";
import { listBankAccounts } from "@/lib/products/cashflow-ai/bank-accounts";
import { RAZORPAYX_ACCOUNT_NAME } from "@/lib/products/cashflow-ai/payments/payouts";
import { disconnectPaymentAccountAction, savePaymentAccountAction, testPaymentAccountAction } from "./actions";

export const metadata: Metadata = { title: "Payments & payouts", robots: { index: false, follow: false } };

export default async function PaymentsSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  const isOwner = user.roles.includes("super_admin");
  const payrollUser = await getCurrentHrmsUser();
  const canManageBanking =
    !!payrollUser && (canRunPayroll(payrollUser) || canManagePayrollConfig(payrollUser));
  if (!isOwner && !canManageBanking) redirect("/commandos");

  const [paymentAccount, allAccounts, provider, bankAccounts, config] = await Promise.all([
    isOwner ? getPaymentAccountView() : Promise.resolve(null),
    payingAccounts(),
    getPayoutProvider(),
    listBankAccounts(),
    getPayrollConfig(),
  ]);
  const accounts = allAccounts.filter((a) => a.accountName !== RAZORPAYX_ACCOUNT_NAME);
  const razorpayxBalance =
    bankAccounts.find((a) => a.accountName === RAZORPAYX_ACCOUNT_NAME)?.currentBalance ?? 0;
  const salaryAccountId =
    config.salaryAccountId && accounts.some((a) => a._id === config.salaryAccountId)
      ? config.salaryAccountId
      : await suggestedAccountId(accounts);

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Payments & payouts" }]}
          title={<>Payments &amp; payouts</>}
          description={<>Manage your Razorpay connection and the company bank accounts used for salary payouts and government payments.</>}
        />
<div className="space-y-4">
        {isOwner && paymentAccount && (
          <section className="space-y-2" aria-labelledby="razorpay-settings-heading">
            <div>
              <h2 id="razorpay-settings-heading" className="text-lg font-semibold">Razorpay connection</h2>
              <p className="text-sm text-muted-foreground">Connect the account used to collect payments and send payouts.</p>
            </div>
            <GlassCard>
              <CardContent>
                <PaymentAccountManager
                  initial={paymentAccount}
                  actions={{ save: savePaymentAccountAction, test: testPaymentAccountAction, disconnect: disconnectPaymentAccountAction }}
                />
              </CardContent>
            </GlassCard>
          </section>
        )}
        <section id="payroll-bank" className="space-y-2" aria-labelledby="payroll-banking-heading">
          <div>
            <h2 id="payroll-banking-heading" className="text-lg font-semibold">RazorpayX and company bank accounts</h2>
            <p className="text-sm text-muted-foreground">Choose the account used to top up RazorpayX and pay statutory dues.</p>
          </div>
          <CompanyBankAccounts
            accounts={accounts.map((a) => ({
              _id: a._id,
              accountName: a.accountName,
              bankName: a.bankName,
              last4: a.last4,
              ifsc: a.ifsc,
              balance: a.balance,
            }))}
            salaryAccountId={salaryAccountId}
            connected={provider.key === "razorpay"}
            razorpayxBalance={razorpayxBalance}
          />
        </section>
      </div>
</div>
    </div>
  );
}
