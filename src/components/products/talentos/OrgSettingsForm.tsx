"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { WEEKDAY_LABELS } from "@/lib/products/talentos/time";
import { INDIAN_STATES } from "@/lib/products/talentos/payroll/rates";
import { saveOrgSettingsAction } from "@/app/(products)/talentos/(protected)/(staff)/settings/actions";

interface Settings {
  workingDays: number[];
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: number;
  earlyDepartureMinutes: number;
  halfDayHours: number;
  fullDayHours: number;
  timezone: string;
  saturdayOffs: number[];
  state: string | null;
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];

export default function OrgSettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    ...settings,
    graceMinutes: String(settings.graceMinutes),
    earlyDepartureMinutes: String(settings.earlyDepartureMinutes),
    halfDayHours: String(settings.halfDayHours),
    fullDayHours: String(settings.fullDayHours),
  });
  const [workingDays, setWorkingDays] = useState<number[]>(settings.workingDays);
  const [saturdayOffs, setSaturdayOffs] = useState<number[]>(settings.saturdayOffs ?? []);
  const [state, setState] = useState<string>(settings.state ?? "");

  function toggleDay(d: number) {
    setWorkingDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const result = await saveOrgSettingsAction({
        workingDays,
        shiftStart: form.shiftStart,
        shiftEnd: form.shiftEnd,
        graceMinutes: form.graceMinutes,
        earlyDepartureMinutes: form.earlyDepartureMinutes,
        halfDayHours: form.halfDayHours,
        fullDayHours: form.fullDayHours,
        timezone: form.timezone,
        saturdayOffs: workingDays.includes(6) ? saturdayOffs : [],
        state,
      });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Work schedule saved");
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Work Schedule</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Working days</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    workingDays.includes(i)
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {err("workingDays")}
          </div>

          {workingDays.includes(6) && (
            <div className="space-y-1.5">
              <Label>Saturdays that are off</Label>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSaturdayOffs((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort()))}
                    className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors", saturdayOffs.includes(n) ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground")}
                  >
                    {ORDINAL[n]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">For example the 2nd and 4th Saturday. They count as weekly offs in attendance, leave and payroll.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>State the office is in</Label>
            <select value={state} onChange={(e) => setState(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm sm:max-w-sm">
              <option value="">Not set</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {err("state")}
            <p className="text-xs text-muted-foreground">State holidays and professional tax follow the state an employee works in; this is the default for everyone who has none set.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Shift start</Label>
              <Input type="time" value={form.shiftStart} onChange={(e) => setForm((f) => ({ ...f, shiftStart: e.target.value }))} aria-invalid={!!errors.shiftStart || undefined} />
              {err("shiftStart")}
            </div>
            <div className="space-y-1.5">
              <Label>Shift end</Label>
              <Input type="time" value={form.shiftEnd} onChange={(e) => setForm((f) => ({ ...f, shiftEnd: e.target.value }))} aria-invalid={!!errors.shiftEnd || undefined} />
              {err("shiftEnd")}
            </div>
            <div className="space-y-1.5">
              <Label>Late grace (minutes)</Label>
              <Input inputMode="numeric" value={form.graceMinutes} onChange={(e) => setForm((f) => ({ ...f, graceMinutes: e.target.value }))} aria-invalid={!!errors.graceMinutes || undefined} />
              {err("graceMinutes")}
            </div>
            <div className="space-y-1.5">
              <Label>Early-departure window (minutes)</Label>
              <Input inputMode="numeric" value={form.earlyDepartureMinutes} onChange={(e) => setForm((f) => ({ ...f, earlyDepartureMinutes: e.target.value }))} aria-invalid={!!errors.earlyDepartureMinutes || undefined} />
              {err("earlyDepartureMinutes")}
            </div>
            <div className="space-y-1.5">
              <Label>Half-day threshold (hours)</Label>
              <Input inputMode="decimal" value={form.halfDayHours} onChange={(e) => setForm((f) => ({ ...f, halfDayHours: e.target.value }))} aria-invalid={!!errors.halfDayHours || undefined} />
              {err("halfDayHours")}
            </div>
            <div className="space-y-1.5">
              <Label>Full-day hours</Label>
              <Input inputMode="decimal" value={form.fullDayHours} onChange={(e) => setForm((f) => ({ ...f, fullDayHours: e.target.value }))} aria-invalid={!!errors.fullDayHours || undefined} />
              {err("fullDayHours")}
            </div>
            <div className="space-y-1.5">
              <Label>Timezone label</Label>
              <Input value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </GlassCard>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Save Schedule"}
      </Button>
    </form>
  );
}
