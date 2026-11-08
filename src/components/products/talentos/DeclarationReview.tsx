"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { reopenDeclarationAction, verifyDeclarationAction } from "@/app/(products)/talentos/(protected)/(staff)/payroll/items/actions";

type D = Record<string, number | boolean | string>;
interface Row {
  _id: string;
  employeeName: string;
  employeeCode: string;
  regime: "old" | "new";
  status: "draft" | "submitted" | "verified";
  declared: D;
  verified: D;
  landlordPan: string | null;
  hrNote: string | null;
  previousTds: number;
}

const AMOUNT_KEYS = ["section80C", "section80CCD1B", "section80DSelf", "section80DParents", "section80DPreventive", "section80E", "section80G", "interestSavings", "section80DDB", "homeLoanInterest", "ltaExemption", "rentPaidAnnual", "otherIncome"];
const LABELS: Record<string, string> = {
  section80C: "80C", section80CCD1B: "NPS 80CCD(1B)", section80DSelf: "80D self", section80DParents: "80D parents", section80DPreventive: "Preventive check-up", section80E: "80E",
  section80G: "80G", interestSavings: "80TTA/TTB", section80DDB: "80DDB", homeLoanInterest: "Home-loan interest", ltaExemption: "LTA", rentPaidAnnual: "Rent paid", otherIncome: "Other income",
};

export default function DeclarationReview({ rows, fy }: { rows: Row[]; fy: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<Row | null>(null);
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  function start(r: Row) {
    setOpen(r);
    setNote(r.hrNote ?? "");
    const base = r.status === "verified" ? r.verified : r.declared;
    setAccepted(Object.fromEntries(AMOUNT_KEYS.map((k) => [k, String(base[k] ?? 0)])));
  }

  function verify() {
    if (!open) return;
    startTransition(async () => {
      const r = await verifyDeclarationAction(open._id, { ...open.declared, ...accepted }, note);
      if (!r.ok) return void toast.error(r.error ?? "Could not verify.");
      toast.success("Declaration verified");
      setOpen(null);
      router.refresh();
    });
  }
  function reopen() {
    if (!open) return;
    startTransition(async () => {
      const r = await reopenDeclarationAction(open._id, note);
      if (!r.ok) return void toast.error(r.error ?? "Could not reopen.");
      toast.success("Sent back to the employee");
      setOpen(null);
      router.refresh();
    });
  }

  return (
    <>
      <GlassCard interactive={false}>
        <CardContent className="py-4">
          <p className="mb-3 text-sm text-muted-foreground">Financial year {fy}. Until the proof cut-off month, what employees declare is used for monthly tax. After it, only the amounts you verify here count, so unproved claims stop reducing the tax in time.</p>
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Regime</TableHead><TableHead>Declared (old regime)</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No declarations yet. Employees without one are taxed in the company default regime with no deductions.</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r._id}>
                  <TableCell>{r.employeeName} <span className="text-xs text-muted-foreground">{r.employeeCode}</span></TableCell>
                  <TableCell className="capitalize">{r.regime}</TableCell>
                  <TableCell className="tabular-nums">{r.regime === "old" ? formatCurrency(AMOUNT_KEYS.filter((k) => k !== "otherIncome").reduce((n, k) => n + Number(r.declared[k] ?? 0), 0)) : "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.status}</Badge></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => start(r)}>Review</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{open?.employeeName}</SheetTitle>
            <SheetDescription>Enter the amount you accept against each head after checking the proofs. Leave it as declared if the proofs are fine.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {open?.landlordPan && <p className="text-xs text-muted-foreground">Landlord PAN: {open.landlordPan}</p>}
            {open && open.previousTds > 0 && <p className="text-xs text-muted-foreground">Tax deducted at the previous employer: {formatCurrency(open.previousTds)}</p>}
            {open?.regime === "new" && <p className="rounded-md bg-muted/40 px-3 py-2 text-xs">This employee chose the new regime, so these deductions do not reduce tax.</p>}
            {AMOUNT_KEYS.map((k) => (
              <div key={k} className="grid grid-cols-[1fr_8rem] items-center gap-2">
                <Label className="text-xs">{LABELS[k]} <span className="text-muted-foreground">(declared {formatCurrency(Number(open?.declared[k] ?? 0))})</span></Label>
                <Input inputMode="numeric" value={accepted[k] ?? ""} onChange={(e) => setAccepted({ ...accepted, [k]: e.target.value })} />
              </div>
            ))}
            <div className="space-y-1.5"><Label>Note to the employee</Label><Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={pending} onClick={verify}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Verify"}</Button>
              {open?.status === "verified" && <Button variant="outline" disabled={pending} onClick={reopen}>Reopen</Button>}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
