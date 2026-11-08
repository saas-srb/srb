"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MultiPicker from "@/components/products/playbook-ai/MultiPicker";
import { saveSettingsAction } from "@/app/(products)/evaliq/(protected)/actions";

export interface SettingsValues {
  organizationName: string;
  certificateNumberFormat: string;
  signatoryName: string;
  signatoryTitle: string;
  defaultValidityMonths: number;
  reminderHoursBeforeDue: number;
  graceSeconds: number;
  evaluatorUserIds: string[];
}

export default function SettingsForm({ initial, users }: { initial: SettingsValues; users: { id: string; label: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof SettingsValues>(k: K, val: SettingsValues[K]) => setV((x) => ({ ...x, [k]: val }));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="s-org">Organization (printed on certificates)</Label>
          <Input id="s-org" value={v.organizationName} onChange={(e) => set("organizationName", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-fmt">Certificate number format</Label>
          <Input id="s-fmt" value={v.certificateNumberFormat} onChange={(e) => set("certificateNumberFormat", e.target.value)} />
          <p className="text-[11px] text-muted-foreground">{"{yyyy} = year, {n} = running number (required)."}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-sig">Signatory name</Label>
          <Input id="s-sig" value={v.signatoryName} onChange={(e) => set("signatoryName", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-sigt">Signatory title</Label>
          <Input id="s-sigt" value={v.signatoryTitle} onChange={(e) => set("signatoryTitle", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-val">Default certificate validity (months, 0 = never expires)</Label>
          <Input id="s-val" type="number" min={0} value={v.defaultValidityMonths} onChange={(e) => set("defaultValidityMonths", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-rem">&ldquo;Deadline approaching&rdquo; reminder (hours before due)</Label>
          <Input id="s-rem" type="number" min={1} value={v.reminderHoursBeforeDue} onChange={(e) => set("reminderHoursBeforeDue", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-grace">Network grace after time is up (seconds)</Label>
          <Input id="s-grace" type="number" min={0} max={120} value={v.graceSeconds} onChange={(e) => set("graceSeconds", Number(e.target.value))} />
          <p className="text-[11px] text-muted-foreground">A final answer save that arrives within this window after the deadline is still accepted; nothing later is.</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Evaluators notified when answers need manual marking</Label>
        <MultiPicker options={users} value={v.evaluatorUserIds} onChange={(x) => set("evaluatorUserIds", x)} placeholder="Search staff…" />
        <p className="text-[11px] text-muted-foreground">The test&apos;s creator is always notified too.</p>
      </div>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await saveSettingsAction({ ...v });
            if (!res.ok) toast.error(res.error);
            else {
              toast.success("Settings saved");
              router.refresh();
            }
          })
        }
      >
        {pending && <Loader2 className="size-3.5 animate-spin" />} Save settings
      </Button>
    </div>
  );
}
