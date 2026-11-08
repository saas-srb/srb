"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star, Eye, EyeOff, ShieldCheck, Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import BankAccountBadge from "@/components/products/talentos/BankAccountBadge";
import { ACCOUNT_TYPES, BANK_VERIFICATION_STATUSES } from "@/lib/products/talentos/payout-status";
import { formatDate } from "@/lib/utils";
import {
  saveBankAccountAction,
  setPrimaryBankAccountAction,
  setBankVerificationAction,
  deleteBankAccountAction,
  revealBankAccountAction,
} from "@/app/(products)/talentos/(protected)/(staff)/employees/[id]/bank-actions";

interface Account {
  _id: string;
  accountHolderName: string;
  bankName: string;
  branch: string | null;
  accountType: string;
  accountNumberMasked: string;
  ifsc: string;
  hasUpi: boolean;
  isPrimary: boolean;
  verificationStatus: string;
  verifiedAt: string | null;
  verificationNote: string | null;
}

const BLANK = { accountHolderName: "", bankName: "", branch: "", accountType: "savings", accountNumber: "", ifsc: "", upiId: "", isPrimary: false };

export default function BankAccountsManager({
  employeeId,
  accounts,
  encryptionReady,
}: {
  employeeId: string;
  accounts: Account[];
  encryptionReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState(BLANK);
  const [verifyFor, setVerifyFor] = useState<Account | null>(null);
  const [verifyStatus, setVerifyStatus] = useState("verified");
  const [verifyNote, setVerifyNote] = useState("");
  const [revealed, setRevealed] = useState<Record<string, { accountNumber: string; upiId: string | null }>>({});

  function openCreate() {
    setEditId(null);
    setForm(BLANK);
    setErrors({});
    setOpen(true);
  }
  function openEdit(a: Account) {
    setEditId(a._id);
    setForm({
      accountHolderName: a.accountHolderName,
      bankName: a.bankName,
      branch: a.branch ?? "",
      accountType: a.accountType,
      accountNumber: "",
      ifsc: a.ifsc,
      upiId: "",
      isPrimary: a.isPrimary,
    });
    setErrors({});
    setOpen(true);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveBankAccountAction(employeeId, form, editId ?? undefined);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Bank account saved");
      setOpen(false);
      router.refresh();
    });
  }
  function makePrimary(id: string) {
    startTransition(async () => {
      const r = await setPrimaryBankAccountAction(employeeId, id);
      if (!r.ok) {
        toast.error(r.error ?? "Could not set primary.");
        return;
      }
      toast.success("Primary account updated");
      router.refresh();
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteBankAccountAction(employeeId, id);
      if (!r.ok) {
        toast.error(r.error ?? "Could not delete.");
        return;
      }
      toast.success("Bank account removed");
      router.refresh();
    });
  }
  function submitVerify() {
    if (!verifyFor) return;
    startTransition(async () => {
      const r = await setBankVerificationAction(employeeId, verifyFor._id, verifyStatus, verifyNote);
      if (!r.ok) {
        toast.error(r.error ?? "Could not update.");
        return;
      }
      toast.success("Verification updated");
      setVerifyFor(null);
      setVerifyNote("");
      router.refresh();
    });
  }
  function reveal(id: string) {
    if (revealed[id]) {
      setRevealed((r) => {
        const n = { ...r };
        delete n[id];
        return n;
      });
      return;
    }
    startTransition(async () => {
      const r = await revealBankAccountAction(id);
      if (!r.ok || !r.accountNumber) {
        toast.error(r.error ?? "Could not reveal.");
        return;
      }
      setRevealed((prev) => ({ ...prev, [id]: { accountNumber: r.accountNumber!, upiId: r.upiId ?? null } }));
      setTimeout(() => setRevealed((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      }), 20000);
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <GlassCard interactive={false}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Bank Accounts</CardTitle>
        <Button type="button" size="sm" onClick={openCreate} disabled={!encryptionReady}>
          <Plus className="size-3.5" data-icon="inline-start" />
          Add Account
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {!encryptionReady && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            Set <code>PLATFORM_ENCRYPTION_KEY</code> in the environment to add or edit bank details.
          </p>
        )}
        {accounts.length === 0 && encryptionReady && <p className="text-sm text-muted-foreground">No bank accounts on file.</p>}

        {accounts.map((a) => (
          <div key={a._id} className="rounded-lg border border-border/60 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.bankName}</span>
                <span className="font-mono text-xs text-muted-foreground">{revealed[a._id]?.accountNumber ?? a.accountNumberMasked}</span>
                {a.isPrimary && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    <Star className="size-2.5" /> Primary
                  </span>
                )}
                <BankAccountBadge status={a.verificationStatus} />
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => reveal(a._id)} aria-label="Reveal account number" disabled={pending}>
                  {revealed[a._id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => { setVerifyFor(a); setVerifyStatus(a.verificationStatus); setVerifyNote(a.verificationNote ?? ""); }} aria-label="Verification" disabled={pending}>
                  <ShieldCheck className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => openEdit(a)} aria-label="Edit" disabled={!encryptionReady || pending}>
                  <Pencil className="size-3.5" />
                </Button>
                {!a.isPrimary && (
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => makePrimary(a._id)} aria-label="Make primary" disabled={pending}>
                    <Star className="size-3.5" />
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete" disabled={pending}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this bank account?</AlertDialogTitle>
                      <AlertDialogDescription>Blocked if a salary payout is in flight against it.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(a._id)}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {a.accountHolderName} · {a.ifsc} · {a.accountType}
              {a.branch ? ` · ${a.branch}` : ""}
              {a.hasUpi ? ` · UPI ${revealed[a._id]?.upiId ?? "••••"}` : ""}
              {a.verifiedAt ? ` · verified ${formatDate(a.verifiedAt)}` : ""}
            </p>
          </div>
        ))}
      </CardContent>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{editId ? "Edit" : "Add"} Bank Account</SheetTitle>
            <SheetDescription>The account number is encrypted at rest and masked everywhere except an audited reveal.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Account holder name *</Label>
              <Input value={form.accountHolderName} onChange={(e) => setForm((f) => ({ ...f, accountHolderName: e.target.value }))} aria-invalid={!!errors.accountHolderName || undefined} />
              {err("accountHolderName")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bank name *</Label>
                <Input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} aria-invalid={!!errors.bankName || undefined} />
                {err("bankName")}
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Input value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Account type</Label>
              <Select value={form.accountType} onValueChange={(v) => v && setForm((f) => ({ ...f, accountType: v as string }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Account number *</Label>
              <Input
                value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                placeholder={editId ? "Re-enter to change" : ""}
                aria-invalid={!!errors.accountNumber || undefined}
              />
              {err("accountNumber")}
            </div>
            <div className="space-y-1.5">
              <Label>IFSC *</Label>
              <Input value={form.ifsc} onChange={(e) => setForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase() }))} aria-invalid={!!errors.ifsc || undefined} />
              {err("ifsc")}
            </div>
            <div className="space-y-1.5">
              <Label>UPI ID (optional)</Label>
              <Input value={form.upiId} onChange={(e) => setForm((f) => ({ ...f, upiId: e.target.value }))} placeholder="name@bank" aria-invalid={!!errors.upiId || undefined} />
              {err("upiId")}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isPrimary} onCheckedChange={(v) => setForm((f) => ({ ...f, isPrimary: v === true }))} />
              Primary account (used for salary payouts)
            </label>
            <Button type="button" onClick={submit} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save Account"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!verifyFor} onOpenChange={(o) => !o && setVerifyFor(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Bank verification</SheetTitle>
            <SheetDescription>{verifyFor?.bankName} {verifyFor?.accountNumberMasked}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={verifyStatus} onValueChange={(v) => v && setVerifyStatus(v as string)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BANK_VERIFICATION_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} placeholder="Penny-drop ref, remark…" />
            </div>
            <Button type="button" onClick={submitVerify} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </GlassCard>
  );
}
