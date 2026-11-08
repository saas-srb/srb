import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { formatInvoiceDate, getSaasInvoice, listCreditNotes, type SaasInvoiceParty } from "@/lib/platform/billing/invoices";
import { gstPercentLabel } from "@/lib/platform/billing/gst";
import { formatMoney } from "@/lib/platform/billing/types";
import InvoiceStatusBadge from "../InvoiceStatusBadge";
import InvoiceActions from "./InvoiceActions";

export const metadata: Metadata = { title: "SaaS invoice" };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-foreground">{children}</dd>
    </div>
  );
}

function PartyCard({ title, party }: { title: string; party: SaasInvoiceParty }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{party.legalName}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="GSTIN">{party.gstin ?? "Unregistered"}</Field>
          <Field label="State">{party.state ? `${party.state}${party.stateCode ? ` (${party.stateCode})` : ""}` : "—"}</Field>
          <Field label="Address">{party.address || "—"}</Field>
          <Field label="Email">{party.email ?? "—"}</Field>
        </dl>
      </CardContent>
    </GlassCard>
  );
}

export default async function PlatformInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPermission("invoices.read");
  const inv = await getSaasInvoice((await params).id);
  if (!inv?.number) notFound();
  const isCredit = inv.kind === "credit_note";
  const [company, notes] = await Promise.all([getCompany(inv.companyId), isCredit ? Promise.resolve([]) : listCreditNotes(inv._id)]);
  const m = (n: number) => formatMoney(n, inv.currency);
  const creditedTotal = inv.credited?.total ?? 0;
  const remaining = inv.total - creditedTotal;
  const half = gstPercentLabel(inv.taxRatePercent / 2);

  return (
    <div className="space-y-4 p-1">
      <PlatformPageHeader
        title={inv.number}
        description={`${isCredit ? "Credit note" : "Tax invoice"} for ${company?.name ?? inv.buyer.name}, ${formatInvoiceDate(inv.issuedAt)}`}
        crumbs={[{ label: "Billing" }, { label: "SaaS invoices", href: "/console/invoices" }]}
        actions={
          <a
            id="invoice-pdf"
            href={`/api/platform/billing/invoices/${inv._id}/pdf?download=1`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            <Download className="size-4" /> Download PDF
          </a>
        }
      />

      <GlassCard interactive={false}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle className="text-xl tabular-nums">
                {isCredit ? "− " : ""}
                {m(inv.total)}
              </CardTitle>
              <InvoiceStatusBadge kind={inv.kind} status={inv.status} credited={isCredit || !creditedTotal ? null : creditedTotal >= inv.total ? "full" : "partial"} />
            </div>
            {!isCredit && <InvoiceActions id={inv._id} number={inv.number} status={inv.status} remainingLabel={remaining > 0 ? m(remaining) : null} />}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label="Company">
              <Link href={`/console/companies/${inv.companyId}`} className="hover:underline">
                {company?.name ?? inv.buyer.name}
              </Link>
            </Field>
            <Field label="Financial year">{inv.financialYear}</Field>
            <Field label="Place of supply">{inv.placeOfSupply ? `${inv.placeOfSupply.name} (${inv.placeOfSupply.code})` : "—"}</Field>
            {inv.planName && <Field label="Plan">{[inv.planName, inv.interval === "yearly" ? "Yearly" : inv.interval === "monthly" ? "Monthly" : null].filter(Boolean).join(" · ")}</Field>}
            {inv.periodStart && inv.periodEnd && <Field label="Period">{`${formatInvoiceDate(inv.periodStart)} – ${formatInvoiceDate(inv.periodEnd)}`}</Field>}
            {isCredit && inv.original && (
              <Field label="Against invoice">
                <Link href={`/console/invoices/${inv.original.id}`} className="hover:underline">
                  {inv.original.number}
                </Link>
              </Field>
            )}
            {inv.paidAt && <Field label="Paid on">{formatInvoiceDate(inv.paidAt)}</Field>}
            {inv.paymentRef && <Field label="Payment ref">{inv.paymentRef}</Field>}
            {inv.refundRef && <Field label="Refund ref">{inv.refundRef}</Field>}
            {inv.reason && <Field label={isCredit ? "Reason" : "Void reason"}>{inv.reason}</Field>}
            {inv.voidedAt && <Field label="Voided on">{formatInvoiceDate(inv.voidedAt)}</Field>}
          </dl>
        </CardContent>
      </GlassCard>

      <div className="grid gap-4 md:grid-cols-2">
        <PartyCard title="Seller" party={inv.seller} />
        <PartyCard title="Buyer" party={inv.buyer} />
      </div>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
          <CardDescription>
            SAC {inv.sac} · GST {gstPercentLabel(inv.taxRatePercent)} {inv.supplyType === "intra" ? "(CGST + SGST)" : "(IGST)"}
            {inv.pricesIncludeTax ? " · prices include tax" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Taxable value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-normal">{it.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{m(it.taxable)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="text-muted-foreground">Taxable value</TableCell>
                <TableCell className="text-right tabular-nums">{m(inv.taxable)}</TableCell>
              </TableRow>
              {inv.supplyType === "intra" ? (
                <>
                  <TableRow>
                    <TableCell className="text-muted-foreground">CGST @ {half}</TableCell>
                    <TableCell className="text-right tabular-nums">{m(inv.cgst)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">SGST @ {half}</TableCell>
                    <TableCell className="text-right tabular-nums">{m(inv.sgst)}</TableCell>
                  </TableRow>
                </>
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground">IGST @ {gstPercentLabel(inv.taxRatePercent)}</TableCell>
                  <TableCell className="text-right tabular-nums">{m(inv.igst)}</TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{m(inv.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      {!isCredit && (
        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Credit notes</CardTitle>
            <CardDescription>{notes.length ? `${m(creditedTotal)} of ${m(inv.total)} credited.` : "None issued against this invoice."}</CardDescription>
          </CardHeader>
          {notes.length > 0 && (
            <CardContent>
              <ul className="divide-y divide-border text-sm" id="invoice-credit-notes">
                {notes.map((n) => (
                  <li key={n._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/console/invoices/${n._id}`} className="font-medium hover:underline">
                      {n.number}
                    </Link>
                    <span className="text-muted-foreground">{formatInvoiceDate(n.issuedAt)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{n.reason}</span>
                    <span className="tabular-nums">− {m(n.total)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </GlassCard>
      )}
    </div>
  );
}
