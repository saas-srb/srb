"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Award, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatMoney } from "@/lib/products/spendiq/constants";
import type { SerializedRfq } from "@/lib/products/spendiq/rfqs";
import { sendRfqAction, addQuotationAction, awardRfqAction } from "@/app/(products)/spendiq/(protected)/(staff)/rfq/actions";

export default function RfqComparison({
  rfq,
  vendors,
  canManage,
}: {
  rfq: SerializedRfq;
  vendors: { _id: string; companyName: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [quoteVendor, setQuoteVendor] = useState("");
  const [prices, setPrices] = useState<string[]>(rfq.lines.map(() => "0"));
  const [deliveryDays, setDeliveryDays] = useState("");
  const [techScore, setTechScore] = useState("");
  const [notes, setNotes] = useState("");

  const ranked = [...rfq.quotations].sort((a, b) => a.totalAmount - b.totalAmount);
  const rankOf = new Map(ranked.map((q, i) => [q.vendorId, i + 1]));

  function addQuote() {
    if (!quoteVendor) {
      toast.error("Select a vendor.");
      return;
    }
    startTransition(async () => {
      const res = await addQuotationAction(rfq._id, {
        vendorId: quoteVendor,
        unitPrices: prices.map((p) => Number(p) || 0),
        deliveryDays: deliveryDays || null,
        technicalScore: techScore || null,
        notes,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Could not save quotation.");
        return;
      }
      toast.success("Quotation recorded");
      setQuoteVendor("");
      setPrices(rfq.lines.map(() => "0"));
      setDeliveryDays("");
      setTechScore("");
      setNotes("");
      router.refresh();
    });
  }

  function award(vendorId: string) {
    startTransition(async () => {
      const res = await awardRfqAction(rfq._id, vendorId);
      if (!res.ok) {
        toast.error(res.error ?? "Could not award.");
        return;
      }
      toast.success("RFQ awarded — draft PO created");
      if (res.poId) router.push(`/spendiq/purchase-orders/${res.poId}`);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {canManage && rfq.status === "draft" && (
        <Button type="button" size="sm" disabled={pending} onClick={() => startTransition(async () => { await sendRfqAction(rfq._id); router.refresh(); })}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" data-icon="inline-start" />}
          Mark sent to vendors
        </Button>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Quotation Comparison</CardTitle></CardHeader>
        <CardContent>
          {rfq.quotations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quotations recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    {rfq.lines.map((l, i) => (
                      <TableHead key={i} className="text-right">{l.description} (unit)</TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Delivery</TableHead>
                    <TableHead className="text-right">Tech</TableHead>
                    <TableHead>Rank</TableHead>
                    {canManage && rfq.status !== "awarded" && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranked.map((q) => (
                    <TableRow key={q.vendorId}>
                      <TableCell className="font-medium">{q.vendorName}</TableCell>
                      {q.unitPrices.map((p, i) => (
                        <TableCell key={i} className="text-right tabular-nums">{formatMoney(p)}</TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums font-semibold">{formatMoney(q.totalAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.deliveryDays != null ? `${q.deliveryDays}d` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.technicalScore != null ? `${q.technicalScore}/10` : "—"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${rankOf.get(q.vendorId) === 1 ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                          {rankOf.get(q.vendorId) === 1 && <Trophy className="size-3" />}
                          L{rankOf.get(q.vendorId)}
                        </span>
                        {rfq.awardedVendorId === q.vendorId && <span className="ml-1 text-xs text-primary">awarded</span>}
                      </TableCell>
                      {canManage && rfq.status !== "awarded" && (
                        <TableCell>
                          <Button type="button" size="xs" disabled={pending} onClick={() => award(q.vendorId)}>
                            <Award className="size-3" data-icon="inline-start" />
                            Award
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </GlassCard>

      {canManage && rfq.status !== "awarded" && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Record a Quotation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Select value={quoteVendor} onValueChange={(v) => setQuoteVendor(v ?? "")}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v._id} value={v._id}>{v.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Delivery (days)</Label>
                <Input type="number" min={0} value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Unit prices</Label>
              {rfq.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-muted-foreground">{l.description} ({l.quantity} {l.uom})</span>
                  <Input type="number" min={0} value={prices[i]} onChange={(e) => setPrices(prices.map((p, idx) => (idx === i ? e.target.value : p)))} className="w-32" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Technical score (0–10)</Label>
                <Input type="number" min={0} max={10} value={techScore} onChange={(e) => setTechScore(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <Button type="button" size="sm" disabled={pending} onClick={addQuote}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save quotation"}
            </Button>
          </CardContent>
        </GlassCard>
      )}
    </div>
  );
}
