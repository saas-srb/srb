import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { FileText } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { NoteStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import CancelNoteButton from "@/components/products/cashflow-ai/CancelNoteButton";
import { cancelDebitNoteAction } from "./actions";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canApproveTransactions } from "@/lib/fms-roles";
import { searchDebitNotes, serializeDebitNote } from "@/lib/products/cashflow-ai/debit-notes";
import { NOTE_STATUSES, formatMoney } from "@/lib/products/cashflow-ai/constants";

export default async function DebitNotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentFmsUser();
  const canCancel = user ? canApproveTransactions(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && NOTE_STATUSES.some((s) => s.value === sp.status) ? (sp.status as "draft" | "issued" | "cancelled") : undefined;

  const result = await searchDebitNotes({ search: sp.search, status, page, pageSize: 20 });
  const issuedTotal = result.items.filter((n) => n.status === "issued").reduce((s, n) => s + n.amount, 0);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Debit Notes" }]}
        title={<>Debit Notes</>}
        description={<>{result.total} debit note{result.total === 1 ? "" : "s"}. Issue one from a bill&apos;s detail page.</>}
      />

      <KpiGrid>
        <KpiCard label="Total Debit Notes" value={result.total} accent icon={<FileText className="size-4" />} />
        <KpiCard label="Issued (this page)" value={<span>{formatMoney(issuedTotal)}</span>} icon={<FileText className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "number", header: "Debit Note" },
          { key: "bill", header: "Bill" },
          { key: "vendor", header: "Vendor" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "status", header: "Status" },
          { key: "actions", header: "" },
        ]}
        rows={result.items.map(serializeDebitNote).map((d) => ({
          id: d._id,
          cells: {
            number: d.debitNoteNumber,
            bill: d.billNumber,
            vendor: d.vendorName,
            amount: formatMoney(d.amount),
            status: <NoteStatusBadge status={d.status} />,
            actions: canCancel && d.status === "issued" ? <CancelNoteButton id={d._id} action={cancelDebitNoteAction} /> : null,
          },
        }))}
        filters={[{ key: "status", label: "Status", value: sp.status ?? "", options: NOTE_STATUSES.map((s) => ({ value: s.value, label: s.label })) }]}
        search={sp.search ?? ""}
        searchPlaceholder="Debit note, bill, vendor"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No debit notes issued yet."
      />
    </div>
  );
}
