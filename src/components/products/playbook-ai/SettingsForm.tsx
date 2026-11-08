"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettingsAction } from "@/app/(products)/playbook-ai/(protected)/actions";

export interface SettingsValues {
  expiringSoonDays: number;
  defaultReviewMonths: number;
  defaultDueDays: number;
  reackOnNewVersion: boolean;
  reminderRepeatDays: number;
  defaultAllowDownload: boolean;
}

export default function SettingsForm({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const [v, setV] = useState<SettingsValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const num = (key: keyof SettingsValues, label: string, hint: string, min: number, max: number) => (
    <div className="space-y-1.5">
      <Label htmlFor={`s-${key}`}>{label}</Label>
      <Input id={`s-${key}`} type="number" min={min} max={max} value={String(v[key])} onChange={(e) => setV((s) => ({ ...s, [key]: Number(e.target.value) }))} />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await updateSettingsAction(v);
          if (!res.ok) setError(res.error);
          else {
            toast.success("Settings saved");
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {num("expiringSoonDays", "Expiring-soon window (days)", "How early an SOP counts as 'expiring' and owners are reminded.", 1, 365)}
        {num("defaultReviewMonths", "Default review period (months)", "Pre-fills the review date when an SOP is first published.", 1, 60)}
        {num("defaultDueDays", "Default acknowledgement due (days)", "Due date offered when assigning an SOP.", 1, 365)}
        {num("reminderRepeatDays", "Reminder repeat (days)", "Minimum gap between automated reminders to the same person.", 1, 60)}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={v.reackOnNewVersion} onChange={(e) => setV((s) => ({ ...s, reackOnNewVersion: e.target.checked }))} />
        <span><span className="font-medium">Re-acknowledgement on new versions (default)</span><span className="block text-xs text-muted-foreground">Pre-ticks the option in the publish dialog. Publishers can still change it per release.</span></span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={v.defaultAllowDownload} onChange={(e) => setV((s) => ({ ...s, defaultAllowDownload: e.target.checked }))} />
        <span><span className="font-medium">Allow download & print on new SOPs</span><span className="block text-xs text-muted-foreground">Per-SOP setting; this is only the starting value.</span></span>
      </label>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" data-icon="inline-start" />}
        Save settings
      </Button>
    </form>
  );
}
