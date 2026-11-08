"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import OfferStatusBadge from "@/components/products/talentos/OfferStatusBadge";
import { OFFER_TRANSITIONS, type OfferStatus } from "@/lib/products/talentos/offers-status";
import { formatDate, formatCurrency } from "@/lib/utils";
import { createOfferAction, updateOfferStatusAction, updateOfferDetailsAction } from "@/app/(products)/talentos/(protected)/(staff)/recruitment/actions";

interface Offer {
  _id: string;
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  positionTitle: string;
  status: string;
  offerDate: string | null;
  proposedJoiningDate: string | null;
  annualCtc: number | null;
  notes: string | null;
  employeeId: string | null;
}

interface Applicant {
  id: string;
  name: string;
  email: string;
  positionTitle: string;
}

export default function OffersManager({
  offers,
  applicants,
  canManage,
}: {
  offers: Offer[];
  applicants: Applicant[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOffer, setEditOffer] = useState<Offer | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ applicationId: "", offerDate: "", proposedJoiningDate: "", annualCtc: "", notes: "" });

  function openCreate() {
    setForm({ applicationId: applicants[0]?.id ?? "", offerDate: "", proposedJoiningDate: "", annualCtc: "", notes: "" });
    setErrors({});
    setCreateOpen(true);
  }
  function openEdit(o: Offer) {
    setEditOffer(o);
    setErrors({});
    setForm({
      applicationId: o.applicationId,
      offerDate: o.offerDate ?? "",
      proposedJoiningDate: o.proposedJoiningDate ?? "",
      annualCtc: o.annualCtc == null ? "" : String(o.annualCtc),
      notes: o.notes ?? "",
    });
  }

  function submitCreate() {
    setErrors({});
    startTransition(async () => {
      const result = await createOfferAction(form);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Offer created (draft)");
      setCreateOpen(false);
      router.refresh();
    });
  }
  function submitEdit() {
    if (!editOffer) return;
    setErrors({});
    startTransition(async () => {
      const result = await updateOfferDetailsAction(editOffer._id, form);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Offer updated");
      setEditOffer(null);
      router.refresh();
    });
  }
  function setStatus(id: string, status: string) {
    startTransition(async () => {
      const result = await updateOfferStatusAction(id, status);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update status.");
        return;
      }
      toast.success(`Offer marked ${status}`);
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  const detailFields = (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Offer date</Label>
          <Input type="date" value={form.offerDate} onChange={(e) => setForm((f) => ({ ...f, offerDate: e.target.value }))} />
          {err("offerDate")}
        </div>
        <div className="space-y-1.5">
          <Label>Proposed joining date</Label>
          <Input type="date" value={form.proposedJoiningDate} onChange={(e) => setForm((f) => ({ ...f, proposedJoiningDate: e.target.value }))} />
          {err("proposedJoiningDate")}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Annual CTC (₹)</Label>
        <Input inputMode="numeric" value={form.annualCtc} onChange={(e) => setForm((f) => ({ ...f, annualCtc: e.target.value }))} aria-invalid={!!errors.annualCtc || undefined} />
        {err("annualCtc")}
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={openCreate} disabled={applicants.length === 0}>
            <Plus className="size-3.5" data-icon="inline-start" />
            New Offer
          </Button>
        </div>
      )}
      {applicants.length === 0 && canManage && offers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Mark a Careers applicant <span className="font-medium">Selected</span> or{" "}
          <span className="font-medium">Hired</span> to create an offer.
        </p>
      )}

      <GlassCard interactive={false}>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Offer / Joining</TableHead>
                <TableHead>CTC</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="w-44" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No offers yet.</TableCell>
                </TableRow>
              )}
              {offers.map((o) => {
                const nextStates = OFFER_TRANSITIONS[o.status as OfferStatus] ?? [];
                return (
                  <TableRow key={o._id}>
                    <TableCell>
                      <Link href={`/talentos/recruitment/${o.applicationId}`} className="font-medium hover:text-primary hover:underline">{o.candidateName}</Link>
                      <div className="text-xs text-muted-foreground">{o.candidateEmail}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{o.positionTitle}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {o.offerDate ? formatDate(o.offerDate) : "—"}
                      {o.proposedJoiningDate ? ` → ${formatDate(o.proposedJoiningDate)}` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{o.annualCtc != null ? formatCurrency(o.annualCtc) : "—"}</TableCell>
                    <TableCell>
                      {o.employeeId ? (
                        <Link href={`/talentos/employees/${o.employeeId}`} className="inline-flex">
                          <OfferStatusBadge status={o.status} />
                        </Link>
                      ) : (
                        <OfferStatusBadge status={o.status} />
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {o.status !== "joined" && (
                            <Button type="button" variant="ghost" size="icon-sm" onClick={() => openEdit(o)} aria-label="Edit offer">
                              <Pencil className="size-3.5" />
                            </Button>
                          )}
                          {nextStates.length > 0 && (
                            <Select onValueChange={(v) => { if (typeof v === "string" && v) setStatus(o._id, v); }} disabled={pending}>
                              <SelectTrigger size="sm" className="w-32">
                                <SelectValue placeholder="Move to…" />
                              </SelectTrigger>
                              <SelectContent>
                                {nextStates.map((s) => (
                                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>New Offer</SheetTitle>
            <SheetDescription>Starts as a draft. Extend it to the candidate when ready.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Candidate *</Label>
              <Select value={form.applicationId || undefined} onValueChange={(v) => v && setForm((f) => ({ ...f, applicationId: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select an applicant" /></SelectTrigger>
                <SelectContent>
                  {applicants.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} · {a.positionTitle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("applicationId")}
            </div>
            {detailFields}
            <Button type="button" onClick={submitCreate} disabled={pending || !form.applicationId} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Create Offer"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!editOffer} onOpenChange={(o) => !o && setEditOffer(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Edit Offer — {editOffer?.candidateName}</SheetTitle>
            <SheetDescription>{editOffer?.positionTitle}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {detailFields}
            <Button type="button" onClick={submitEdit} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
