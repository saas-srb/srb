import { Badge } from "@/components/ui/badge";

/** Invoice / credit-note status, as one badge (plus "Credited" when credit notes cover it). */
export default function InvoiceStatusBadge({ kind, status, credited }: { kind: string; status: string; credited?: "full" | "partial" | null }) {
  if (kind === "credit_note") return <Badge variant="outline">Credit note</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {status === "paid" ? (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Paid</Badge>
      ) : status === "unpaid" ? (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Unpaid</Badge>
      ) : (
        <Badge variant="destructive">Void</Badge>
      )}
      {credited === "full" && <Badge variant="secondary">Credited</Badge>}
      {credited === "partial" && <Badge variant="secondary">Part credited</Badge>}
    </span>
  );
}
