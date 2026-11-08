import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { NoteStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import CancelNoteButton from "@/components/products/cashflow-ai/CancelNoteButton";
import { cancelCreditNoteAction } from "../actions";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canApproveTransactions } from "@/lib/fms-roles";
import { getCreditNote, serializeCreditNote } from "@/lib/products/cashflow-ai/credit-notes";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDateTime } from "@/lib/utils";

export default async function CreditNoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentFmsUser();
  const raw = await getCreditNote(id);
  if (!raw) notFound();
  const note = serializeCreditNote(raw);
  const canCancel = user ? canApproveTransactions(user) : false;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Credit Notes", href: "/cashflow-ai/credit-notes" }, { label: note.creditNoteNumber }]}
        title={<>{note.creditNoteNumber}</>}
        description={<>{note.customerName}</>}
        actions={<><div className="flex items-center gap-2">
          <NoteStatusBadge status={note.status} />
          {canCancel && note.status === "issued" && <CancelNoteButton id={note._id} action={cancelCreditNoteAction} />}
        </div></>}
      />

      <GlassCard>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Invoice" value={<Link href={`/cashflow-ai/invoices/${note.invoiceId}`} className="text-primary hover:underline">{note.invoiceNumber}</Link>} />
          <Row label="Amount" value={formatMoney(note.amount)} />
          <Row label="Reason" value={note.reason} />
          <Row label="Issued At" value={note.issuedAt ? formatDateTime(note.issuedAt) : "—"} />
          <Row label="Created" value={formatDateTime(note.createdAt)} />
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
