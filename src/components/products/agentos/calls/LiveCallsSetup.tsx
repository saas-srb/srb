"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle, Copy, LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/products/agentos/AibotsUi";
import { confirmLiveSetupStepAction } from "@/lib/products/agentos/calls/conference-actions";
import { saveCallModeAction } from "@/app/(products)/commandos/(protected)/settings/products/agentos/phone-actions";
import { setupSummary } from "@/lib/products/agentos/calls/call-display";
import type { ConferenceSetup } from "@/lib/products/agentos/calls/conference-setup";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "auto", label: "Automatic (recommended)", text: "Calls run in a live conference when every step below is done, so your team can listen in and take over. Until then they are placed directly by ElevenLabs." },
  { value: "conference", label: "Live conference", text: "Always try to run calls in a live conference. If the setup is incomplete, calls still go out directly and a banner says why." },
  { value: "direct", label: "Direct", text: "ElevenLabs places the call itself. Simplest, but nobody can listen in or take over by phone; only the transcript can be followed." },
] as const;

/** The live-call setup checklist (Phone page) and how calls are placed. Managers only; every change is re-checked on the server. */
export default function LiveCallsSetup({ setup }: { setup: ConferenceSetup }) {
  const router = useRouter();
  const [mode, setMode] = useState(setup.callMode);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const summary = setupSummary(setup.steps);

  const confirm = (step: "voiceUrl" | "agentAudio", done: boolean) =>
    start(async () => {
      setBusy(step);
      const r = await confirmLiveSetupStepAction(step, done);
      setBusy(null);
      if (!r.ok) return void toast.error(r.error);
      toast.success(done ? "Step ticked" : "Step unticked");
      router.refresh();
    });
  const saveMode = () =>
    start(async () => {
      setBusy("mode");
      const r = await saveCallModeAction(mode);
      setBusy(null);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Calling mode saved");
      router.refresh();
    });
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Address copied");
    } catch {
      toast.error("Couldn't copy. Select the address and copy it by hand.");
    }
  };

  const twilioProblems = setup.twilio?.fields.filter((f) => !f.ok) ?? [];

  return (
    <div className="space-y-5">
      <div role="status" className={cn("rounded-2xl border px-4 py-3 text-sm font-semibold", summary.ready ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200")}>
        Live listen &amp; take-over: {summary.ready ? "ready" : `not ready (missing: ${summary.missing.join(", ")})`}
      </div>

      {setup.twilio && twilioProblems.length > 0 && (
        <Notice tone="warn">
          {setup.twilio.source === "platform"
            ? "Only SelfRun's shared Twilio account is available, and it is never used for live calls. Add your own Twilio account's details."
            : setup.twilio.source === "none"
              ? "Twilio isn't connected."
              : "Your Twilio connection is missing details live calls need."}{" "}
          Still to fill in: {twilioProblems.map((f) => `${f.label}${f.problem === "malformed" ? " (doesn't look right)" : ""}`).join("; ")}.{" "}
          <Link href="/commandos/settings/integrations" className="font-semibold underline">Open Settings → Integrations → Twilio</Link>.
        </Notice>
      )}

      <ol className="space-y-2">
        {setup.steps.map((s, i) => (
          <li key={s.key} className="rounded-2xl border border-border/50 bg-muted/20 p-3">
            <div className="flex items-start gap-3">
              {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Done" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not done" />}
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-semibold">{i + 1}. {s.label}<span className="ml-2 text-[11px] font-medium text-muted-foreground">{s.done ? "Done" : s.manual ? "Waiting for you to confirm" : "Not done"}</span></p>
                {s.help && <p className="text-xs text-muted-foreground">{s.help}</p>}
                {s.key === "voiceUrl" && (setup.voiceUrl ? (
                  <div className="space-y-1">
                    <Label htmlFor="live-voice-url" className="text-[11px]">Voice request URL (method POST)</Label>
                    <div className="flex gap-2">
                      <Input id="live-voice-url" readOnly value={setup.voiceUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                      <Button type="button" variant="outline" size="icon" onClick={() => copy(setup.voiceUrl!)} aria-label="Copy the voice URL"><Copy className="size-4" /></Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">The address contains your company&apos;s private key. Only paste it into the TwiML App.</p>
                  </div>
                ) : <p className="text-xs text-amber-700 dark:text-amber-300">The address isn&apos;t available until secure storage is on.</p>)}
                <div className="flex flex-wrap items-center gap-2">
                  {s.href && !s.done && <Link href={s.href} className="text-xs font-semibold text-primary hover:underline">{s.href.startsWith("/commandos") ? "Open Integrations" : "Open Phone"}</Link>}
                  {s.manual && (s.key === "voiceUrl" || s.key === "agentAudio") && (
                    <Button type="button" size="sm" variant={s.done ? "ghost" : "outline"} disabled={pending} onClick={() => confirm(s.key as "voiceUrl" | "agentAudio", !s.done)}>
                      {busy === s.key && <LoaderCircle className="size-3.5 animate-spin" />}{s.done ? "Untick" : "I did this"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <fieldset className="space-y-2 rounded-2xl border border-border/50 p-4" disabled={pending}>
        <legend className="px-1 text-sm font-semibold">How calls are placed</legend>
        {MODES.map((m) => (
          <label key={m.value} className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="radio" name="call-mode" className="mt-1 size-4 accent-primary" checked={mode === m.value} onChange={() => setMode(m.value)} />
            <span><span className="font-medium">{m.label}</span><span className="block text-xs text-muted-foreground">{m.text}</span></span>
          </label>
        ))}
        <p className="text-[11px] text-muted-foreground">Calls placed right now use: <strong>{setup.effectiveMode === "conference" ? "a live conference" : "direct calling"}</strong>.</p>
        <div className="flex justify-end">
          <Button type="button" onClick={saveMode} disabled={pending || mode === setup.callMode}>{busy === "mode" ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Save mode</Button>
        </div>
      </fieldset>
    </div>
  );
}
