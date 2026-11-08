import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Badge } from "@/components/ui/badge";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";

/**
 * Reference-only — every prefix here is a real, in-use compile-time
 * constant (`*_NUMBER_PREFIX` in each `fms/*.ts` file), all following the
 * same `PREFIX-YYYY-NNNNNN` shape via `nextYearSequence`/`formatYearCode`
 * (`fms/db.ts`). Making this admin-editable would mean refactoring every
 * one of these files to read a prefix from a config collection instead of
 * a constant — a real but disproportionate change with no concrete ask
 * behind it; this page exists so the nav item isn't dead, not to promise
 * editability that isn't there.
 */
const DOCUMENT_TYPES = [
  { prefix: "TXN", label: "Transaction", example: "TXN-2026-000123" },
  { prefix: "INV", label: "Invoice", example: "INV-2026-000045" },
  { prefix: "REC", label: "Payment Receipt", example: "REC-2026-000078" },
  { prefix: "RFD", label: "Refund", example: "RFD-2026-000012" },
  { prefix: "CRN", label: "Credit Note", example: "CRN-2026-000009" },
  { prefix: "DBN", label: "Debit Note", example: "DBN-2026-000005" },
  { prefix: "RMB", label: "Reimbursement", example: "RMB-2026-000031" },
  { prefix: "ADV", label: "Employee Advance", example: "ADV-2026-000014" },
  { prefix: "DSP", label: "Asset Disposal", example: "DSP-2026-000003" },
  { prefix: "AEX", label: "Asset Expense", example: "AEX-2026-000022" },
  { prefix: "TRF", label: "Fund Transfer", example: "TRF-2026-000017" },
  { prefix: "JE", label: "Journal Entry", example: "JE-2026-000456" },
];

export default function NumberingPage() {
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Settings" }, { label: "Numbering" }]}
        title={<>Numbering</>}
        description={<>Every document type&apos;s real, in-use numbering format — reference only, not an editable config.</>}
      />

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Document Numbering</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document Type</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Example</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DOCUMENT_TYPES.map((d) => (
                <TableRow key={d.prefix}>
                  <TableCell className="font-medium">{d.label}</TableCell>
                  <TableCell><Badge variant="secondary">{d.prefix}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{d.prefix}-YYYY-NNNNNN</TableCell>
                  <TableCell className="font-mono text-xs">{d.example}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        Every number resets its sequence each calendar year (the <code>YYYY</code> segment) and is assigned
        atomically at creation time — never reused, never editable after the fact.
      </p>
    </div>
  );
}
