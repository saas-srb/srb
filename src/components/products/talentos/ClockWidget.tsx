"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { formatMinutesAsDuration } from "@/lib/products/talentos/time";
import { clockInAction, clockOutAction } from "@/app/(products)/talentos/(protected)/me/attendance/actions";

export default function ClockWidget({
  dayLabel,
  working,
  checkIn,
  checkOut,
  workedMinutes,
  locked,
}: {
  dayLabel: string;
  working: boolean;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [now] = useState(() => new Date());

  function run(fn: typeof clockInAction, verb: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? `Could not clock ${verb}.`);
        return;
      }
      toast.success(`Clocked ${verb} at ${result.time}`);
      router.refresh();
    });
  }

  const canIn = !checkIn && !locked;
  const canOut = !!checkIn && !checkOut && !locked;

  return (
    <GlassCard interactive={false}>
      <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(now)} · {dayLabel}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span>
              In: <span className="font-semibold text-foreground">{checkIn ?? "—"}</span>
            </span>
            <span>
              Out: <span className="font-semibold text-foreground">{checkOut ?? "—"}</span>
            </span>
            <span>
              Worked: <span className="font-semibold text-foreground">{workedMinutes > 0 ? formatMinutesAsDuration(workedMinutes) : "—"}</span>
            </span>
          </div>
          {locked && <p className="mt-1 text-xs text-muted-foreground">HR has set today&apos;s attendance — clock is disabled.</p>}
          {!working && !locked && <p className="mt-1 text-xs text-muted-foreground">Not a working day — clocking still recorded if you do.</p>}
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => run(clockInAction, "in")} disabled={!canIn || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" data-icon="inline-start" />}
            Clock In
          </Button>
          <Button type="button" variant="outline" onClick={() => run(clockOutAction, "out")} disabled={!canOut || pending}>
            <LogOut className="size-4" data-icon="inline-start" />
            Clock Out
          </Button>
        </div>
      </CardContent>
    </GlassCard>
  );
}
