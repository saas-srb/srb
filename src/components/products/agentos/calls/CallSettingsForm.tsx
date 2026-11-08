"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCallSettingsAction } from "@/app/(products)/commandos/(protected)/settings/products/agentos/phone-actions";
import { normalizeCallingCodes, normalizeE164 } from "@/lib/products/agentos/calls/phone";
import type { CallSettings } from "@/lib/products/agentos/calls/types";

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p role="alert" className="text-[11px] text-destructive">{error}</p> : hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** The calling rules every outbound call is checked against. The company time zone comes from the workspace; it is shown, not edited, here. */
export default function CallSettingsForm({ initial, timeZone, limits }: { initial: CallSettings; timeZone: string | null; limits: { duplicateMax: number; capMax: number } }) {
  const router = useRouter();
  const [codes, setCodes] = useState(initial.allowedCallingCodes.join(", "));
  const [start, setStart] = useState(initial.windowStart);
  const [end, setEnd] = useState(initial.windowEnd);
  const [dup, setDup] = useState(String(initial.duplicateWindowMinutes));
  const [userCap, setUserCap] = useState(String(initial.perUserHourlyCap));
  const [companyCap, setCompanyCap] = useState(String(initial.perCompanyHourlyCap));
  const [disclosure, setDisclosure] = useState(initial.requireDisclosure);
  const [recording, setRecording] = useState(initial.recordingNotice);
  const [testNumber, setTestNumber] = useState(initial.testNumber ?? "");
  const [pending, run] = useTransition();

  const parsed = useMemo(() => normalizeCallingCodes(codes.split(/[\s,;]+/).filter(Boolean)), [codes]);
  const whole = (v: string, min: number, max: number) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max;
  const errors = {
    window: !start || !end ? "Set both times." : minutes(start) >= minutes(end) ? "The calling window must end after it starts. Overnight windows aren't supported." : null,
    dup: whole(dup, 0, limits.duplicateMax) ? null : `Enter a whole number from 0 to ${limits.duplicateMax}.`,
    userCap: whole(userCap, 1, limits.capMax) ? null : `Enter a whole number from 1 to ${limits.capMax}.`,
    companyCap: whole(companyCap, 1, limits.capMax) ? null : `Enter a whole number from 1 to ${limits.capMax}.`,
    testNumber: !testNumber.trim() || normalizeE164(testNumber) ? null : "Enter the test number with its country code, for example +91 98765 43210.",
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = () =>
    run(async () => {
      const r = await saveCallSettingsAction({
        allowedCallingCodes: parsed, windowStart: start, windowEnd: end, duplicateWindowMinutes: Number(dup), perUserHourlyCap: Number(userCap),
        perCompanyHourlyCap: Number(companyCap), requireDisclosure: disclosure, recordingNotice: recording, testNumber: testNumber.trim() ? normalizeE164(testNumber) : null,
      });
      if (!r.ok) return void toast.error(r.error);
      setCodes(r.settings.allowedCallingCodes.join(", "));
      setTestNumber(r.settings.testNumber ?? "");
      toast.success("Call settings saved");
      router.refresh();
    });

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) save();
      }}
    >
      <Field
        label="Countries you may call"
        htmlFor="cs-codes"
        hint={parsed.length ? `Calls are allowed to numbers starting with ${parsed.join(", ")}.` : "Enter calling codes separated by commas, for example +91, +1. Until you add one, nobody can place a call."}
        error={codes.trim() && parsed.length === 0 ? "Those don't look like calling codes. Use a plus sign and digits, for example +91." : null}
      >
        <Input id="cs-codes" value={codes} onChange={(e) => setCodes(e.target.value)} disabled={pending} autoComplete="off" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Calls may start from" htmlFor="cs-start" error={errors.window}>
          <Input id="cs-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={pending} />
        </Field>
        <Field label="Calls must end by" htmlFor="cs-end" hint={timeZone ? `Times are in your company time zone: ${timeZone}.` : undefined}>
          <Input id="cs-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={pending} />
        </Field>
      </div>
      {!timeZone && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />The workspace time zone isn&apos;t set, so the calling hours can&apos;t be checked and no call can be placed. Set it in the workspace settings.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Same number again after (minutes)" htmlFor="cs-dup" hint="A number called or scheduled within this time can't be called again. 0 turns the check off." error={errors.dup}>
          <Input id="cs-dup" inputMode="numeric" value={dup} onChange={(e) => setDup(e.target.value)} disabled={pending} />
        </Field>
        <Field label="Calls per person per hour" htmlFor="cs-user" error={errors.userCap}>
          <Input id="cs-user" inputMode="numeric" value={userCap} onChange={(e) => setUserCap(e.target.value)} disabled={pending} />
        </Field>
        <Field label="Calls per workspace per hour" htmlFor="cs-company" error={errors.companyCap}>
          <Input id="cs-company" inputMode="numeric" value={companyCap} onChange={(e) => setCompanyCap(e.target.value)} disabled={pending} />
        </Field>
      </div>

      <Field
        label="Test number"
        htmlFor="cs-test"
        hint="Leave empty for real calls. When a number is set, EVERY outbound call (new, scheduled, retried or moved to a phone) rings this number instead of the person's real one; the person's record stays linked and calls are marked TEST. The calling rules above are checked against the test number. Website and incoming calls are not affected."
        error={errors.testNumber}
      >
        <Input id="cs-test" value={testNumber} onChange={(e) => setTestNumber(e.target.value)} disabled={pending} autoComplete="off" placeholder="+91 98765 43210" />
      </Field>
      {testNumber.trim() && !errors.testNumber && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />Test mode is on once you save: no real lead or candidate will be called.
        </p>
      )}

      <div className="space-y-3 rounded-2xl border border-border/50 bg-muted/20 p-4">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={disclosure} onChange={(e) => setDisclosure(e.target.checked)} disabled={pending} />
          <span>
            <span className="font-medium">Agents must have an AI disclosure line</span>
            <span className="block text-xs text-muted-foreground">An agent without a disclosure line can&apos;t place outbound calls. Recommended: people should know they are talking to an AI.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={recording} onChange={(e) => setRecording(e.target.checked)} disabled={pending} />
          <span>
            <span className="font-medium">Tell people the call may be recorded</span>
            <span className="block text-xs text-muted-foreground">The notice is kept with every call&apos;s compliance record. You are responsible for lawful use of your numbers (including TRAI/DND rules).</span>
          </span>
        </label>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || invalid}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Save settings</Button>
      </div>
    </form>
  );
}
