import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Paperclip, Download } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { TransactionStatusBadge, TransactionTypeBadge } from "@/components/products/cashflow-ai/StatusBadges";
import TransactionStatusActions from "@/components/products/cashflow-ai/TransactionStatusActions";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions, canApproveTransactions } from "@/lib/fms-roles";
import { getTransaction, serializeTransaction } from "@/lib/products/cashflow-ai/transactions";
import { getAccount } from "@/lib/products/cashflow-ai/accounts";
import { getFundAccountLabel } from "@/lib/products/cashflow-ai/fund-accounts";
import { getClient } from "@/lib/products/sprintos/clients";
import { getVendor } from "@/lib/products/spendiq/vendors";
import { listAudit, serializeAuditLog } from "@/lib/products/cashflow-ai/audit";
import { uploadTransactionAttachmentAction } from "../actions";
import { formatMoney, sourceModuleLabel, paymentMethodLabel } from "@/lib/products/cashflow-ai/constants";
import { formatDateTime, formatDate } from "@/lib/utils";

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentFmsUser();
  const txn = await getTransaction(id);
  if (!txn) notFound();

  const [account, customer, vendor, audit, fundAccountLabel] = await Promise.all([
    txn.accountId ? getAccount(txn.accountId) : Promise.resolve(null),
    txn.customerId ? getClient(txn.customerId) : Promise.resolve(null),
    txn.vendorId ? getVendor(txn.vendorId) : Promise.resolve(null),
    listAudit({ entity: "transaction", entityId: id, pageSize: 50 }),
    getFundAccountLabel(txn.fundAccountType, txn.fundAccountId),
  ]);

  const t = serializeTransaction(txn);
  const canManage = user ? canManageTransactions(user) : false;
  const canApprove = user ? canApproveTransactions(user) : false;
  async function uploadAction(formData: FormData) {
    "use server";
    await uploadTransactionAttachmentAction(id, formData);
  }

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Transactions", href: "/cashflow-ai/transactions" }, { label: t.transactionNumber }]}
        title={<>{t.transactionNumber}
            <TransactionTypeBadge type={t.type} /></>}
        description={<>{formatMoney(t.amount, t.currency)} · {formatDate(t.transactionDate)}</>}
        actions={<><TransactionStatusBadge status={t.status} /></>}
      />

      {(canApprove || canManage) && (
        <GlassCard>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent>
            <TransactionStatusActions id={t._id} status={t.status} />
          </CardContent>
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Transaction Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Amount" value={formatMoney(t.amount, t.currency)} />
            <Row label="Tax Amount" value={formatMoney(t.taxAmount, t.currency)} />
            <Row label="Payment Method" value={paymentMethodLabel(t.paymentMethod)} />
            <Row label="Source Module" value={sourceModuleLabel(t.sourceModule)} />
            <Row label="Source Record" value={t.sourceRecordId ?? "—"} />
            <Row label="Reference Number" value={t.referenceNumber ?? "—"} />
            <Row label="Transaction Date" value={formatDate(t.transactionDate)} />
            <Row label="Posting Date" value={formatDate(t.postingDate)} />
            <Row label="Category / Account" value={account ? `${account.code} · ${account.name}` : "—"} />
            <Row label="Fund Account" value={fundAccountLabel ?? "—"} />
            <Row label="Department" value={t.department ?? "—"} />
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Parties &amp; Approval</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Customer"
              value={
                customer ? (
                  <Link href={`/cashflow-ai/customers/${customer._id}`} className="text-primary hover:underline">
                    {customer.companyName}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <Row
              label="Vendor"
              value={
                vendor ? (
                  <Link href={`/cashflow-ai/vendors/${vendor._id}`} className="text-primary hover:underline">
                    {vendor.companyName}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <Row label="Employee" value={t.employeeId ?? "—"} />
            <Row label="Approved By" value={t.approvedBy ?? "—"} />
            <Row label="Approved At" value={t.approvedAt ? formatDateTime(t.approvedAt) : "—"} />
            <Row label="Created" value={formatDateTime(t.createdAt)} />
            <Row label="Last Updated" value={formatDateTime(t.updatedAt)} />
          </CardContent>
        </GlassCard>
      </div>

      {t.description && (
        <GlassCard>
          <CardHeader><CardTitle>Description</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{t.description}</CardContent>
        </GlassCard>
      )}

      <GlassCard>
        <CardHeader><CardTitle>Attachments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {t.attachments.length === 0 && <p className="text-sm text-muted-foreground">No attachments yet.</p>}
          <ul className="space-y-1.5">
            {t.attachments.map((a) => (
              <li key={a.storageKey} className="flex items-center gap-2 text-sm">
                <Paperclip className="size-3.5 text-muted-foreground" />
                <a href={`/api/cashflow-ai/attachments/${a.storageKey}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {a.filename}
                </a>
                <Download className="size-3 text-muted-foreground" />
              </li>
            ))}
          </ul>
          {canManage && (
            <form action={uploadAction} className="flex items-center gap-2">
              <input type="file" name="file" required className="text-sm" />
              <Button type="submit" size="sm" variant="outline">Upload</Button>
            </form>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader><CardTitle>Audit History</CardTitle></CardHeader>
        <CardContent>
          {audit.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {audit.items.map(serializeAuditLog).map((entry) => (
                <li key={entry._id} className="border-b border-border/40 pb-2 text-sm last:border-0 last:pb-0">
                  <span className="font-medium text-foreground capitalize">{entry.action}</span>{" "}
                  <span className="text-muted-foreground">by {entry.actorEmail ?? entry.actorId}</span>
                  {entry.summary && <span className="text-muted-foreground"> — {entry.summary}</span>}
                  <div className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
