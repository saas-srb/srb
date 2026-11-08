"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BanIcon, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ActionButton from "@/components/products/agentos/ActionButton";
import { EmptyState } from "@/components/products/agentos/AibotsUi";
import { addDoNotCallAction, removeDoNotCallAction } from "@/app/(products)/commandos/(protected)/settings/products/agentos/phone-actions";
import { formatInZone } from "@/lib/products/agentos/calls/call-ui";
import type { DncEntryView } from "@/lib/products/agentos/calls/dnc";

/** The numbers nobody may call. Only the last four digits are kept visible; the full number is never shown again after saving. */
export default function DoNotCallManager({ entries, timeZone, whoAdded }: { entries: DncEntryView[]; timeZone: string | null; whoAdded: Record<string, string> }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const r = await addDoNotCallAction(phone, reason);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Number added to the do-not-call list");
      setPhone("");
      setReason("");
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <form
        className="rounded-2xl border border-border/50 bg-muted/20 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="dnc-phone">Number (with country code)</Label>
            <Input id="dnc-phone" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={pending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dnc-reason">Why is it on the list?</Label>
            <Input id="dnc-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} />
          </div>
          <Button type="submit" disabled={pending || !phone.trim() || reason.trim().length < 3}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Add</Button>
        </div>
      </form>

      {entries.length === 0 ? (
        <EmptyState icon={<BanIcon className="size-5" />} title="The list is empty">Numbers you add here can never be called, by anyone, from any product.</EmptyState>
      ) : (
        <ul className="divide-y divide-border/40">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium"><span className="font-mono">…{e.last4}</span> <span className="font-normal text-muted-foreground">· {e.reason}</span></p>
                <p className="text-[11px] text-muted-foreground">Added {formatInZone(e.addedAt, timeZone)} by {whoAdded[e.addedBy] ?? "a team member"}</p>
              </div>
              <ActionButton
                action={() => removeDoNotCallAction(e.id)}
                success="Removed from the list"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                confirm={{ title: `Remove …${e.last4}?`, description: "This number can be called again. Only do this if the person has agreed to be contacted.", confirmLabel: "Remove" }}
              >
                <Trash2 className="size-3.5" />Remove
              </ActionButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
