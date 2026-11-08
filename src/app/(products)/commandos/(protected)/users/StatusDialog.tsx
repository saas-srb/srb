"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ACCOUNT_STATUSES, canSignIn, statusMeta, type AccountStatus } from "@/lib/security/account-status";
import { bulkChangeStatusAction, changeAccountStatusAction } from "./actions";

export interface StatusTarget {
  id: string;
  email: string;
  name: string;
  status: AccountStatus;
}

const GROUPS = [
  { key: "working", title: "Working: can sign in" },
  { key: "blocked", title: "Blocked: cannot sign in, can be reversed" },
  { key: "left", title: "Left the company: cannot sign in" },
] as const;

/**
 * The Director sets a person's status. A status that cannot sign in ends every sign-in of that person at once, in every product; their
 * roles, records and HR file stay, so coming back is just choosing "Active" again.
 */
export default function StatusDialog({ targets, onClose, onDone }: { targets: StatusTarget[] | null; onClose: () => void; onDone: () => void }) {
  const open = targets !== null && targets.length > 0;
  const single = targets?.length === 1 ? targets[0] : null;
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [reason, setReason] = useState("");
  const [lastDay, setLastDay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    setReason("");
    setLastDay("");
    setError(null);
  }, [open]);

  if (!targets) return null;
  const meta = status ? statusMeta(status) : null;
  const needsReason = !!meta && "needsReason" in meta && meta.needsReason;
  const needsLastDay = !!meta && "needsLastDay" in meta && meta.needsLastDay;
  const ends = !!status && !canSignIn({ status, roles: ["x"] });
  const who = single ? (single.name || single.email) : `${targets.length} people`;

  function save() {
    if (!status) return;
    setError(null);
    const input = { status, reason, lastWorkingDay: lastDay || null };
    start(async () => {
      if (single) {
        const r = await changeAccountStatusAction(single.id, input);
        if (!r.ok) return setError(r.error ?? "Could not change the status.");
        toast.success(`${who} is now ${statusMeta(status).label.toLowerCase()}.`);
      } else {
        const r = await bulkChangeStatusAction(targets!.map((t) => t.id), input);
        if (r.changed === 0) return setError(r.firstError ?? "Nothing was changed.");
        toast[r.skipped > 0 ? "warning" : "success"](`${r.changed} changed${r.skipped > 0 ? `, ${r.skipped} skipped (${r.firstError ?? "not allowed"})` : ""}.`);
      }
      onDone();
      onClose();
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle className="text-lg font-semibold">Change status of {who}</SheetTitle>
          <SheetDescription className="text-xs">
            {single ? <>Now: <b>{statusMeta(single.status).label}</b>. </> : null}
            Choose what happens to the account. It is recorded in the account&apos;s history with your name.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {GROUPS.map((g) => (
            <fieldset key={g.key} className="space-y-1.5">
              <legend className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{g.title}</legend>
              {ACCOUNT_STATUSES.filter((s) => s.group === g.key).map((s) => {
                const disabled = !!single && single.status === s.value;
                return (
                  <label
                    key={s.value}
                    className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition-colors", status === s.value ? "border-primary bg-primary/[0.06] ring-1 ring-primary/30" : "hover:bg-muted/50", disabled && "cursor-not-allowed opacity-50")}
                  >
                    <input type="radio" name="account-status" className="mt-1 accent-primary" checked={status === s.value} disabled={disabled} onChange={() => setStatus(s.value)} />
                    <span>
                      <span className="block font-medium">{s.label}{disabled ? " (current)" : ""}</span>
                      <span className="block text-xs text-muted-foreground">{s.description}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}

          {meta && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-3.5">
              {needsLastDay && (
                <div className="space-y-1.5">
                  <Label htmlFor="st-lastday">Last working day</Label>
                  <Input id="st-lastday" type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="st-reason">{needsReason ? "Reason (required)" : "Note (optional)"}</Label>
                <Textarea id="st-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder={needsReason ? "For example: under enquiry, policy breach, project ended …" : "Anything worth remembering"} />
              </div>
              {ends ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {single ? "They are" : "Each person is"} signed out of every product right now and cannot sign in again until a Director changes the status back. Their records, roles and HR file stay as they are.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{single ? "They keep" : "Each person keeps"} signing in as usual{canSignIn({ status: status ?? "active", roles: ["x"] }) && single && !canSignIn({ status: single.status, roles: ["x"] }) ? ", and signing in works again right away" : ""}.</p>
              )}
            </div>
          )}
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>

        <SheetFooter className="flex-row items-center justify-end gap-2 border-t border-border p-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" variant={ends ? "destructive" : "default"} onClick={save} disabled={pending || !status}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Save status"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
