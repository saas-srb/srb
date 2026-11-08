"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { saveTestConfigAction } from "@/app/(products)/evaliq/(protected)/actions";
import { ATTEMPT_SCORING, RESULT_DETAILS, RESULT_RELEASES } from "@/lib/products/evaliq/constants";

export interface ConfigValues {
  durationMinutes: string;
  autoSubmit: boolean;
  startAt: string;
  endAt: string;
  maxAttempts: string;
  allowRetake: boolean;
  retakeOnlyIfFailed: boolean;
  questionsPerAttempt: string;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  negativeMarking: boolean;
  passMode: string;
  passingPercentage: string;
  passingMarks: string;
  allowNavigation: boolean;
  allowBack: boolean;
  allowReview: boolean;
  resultRelease: string;
  resultDetail: string;
  showExplanations: boolean;
  attemptScoring: string;
  security: { requireFullscreen: boolean; detectTabSwitch: boolean; blockCopyPaste: boolean; blockRightClick: boolean; singleSession: boolean; maxViolations: string };
}

/** ISO → `datetime-local` value in the browser's own timezone. */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-2.5 rounded-xl border border-border/50 px-3 py-2 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-muted/30"}`}>
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

export default function TestConfigForm({ id, initial, next }: { id: string; initial: ConfigValues; next: string }) {
  const router = useRouter();
  // `initial.startAt` / `endAt` arrive as ISO strings.
  const [v, setV] = useState(() => ({ ...initial, startAt: toLocalInput(initial.startAt), endAt: toLocalInput(initial.endAt) }));
  const [pending, start] = useTransition();
  const set = <K extends keyof ConfigValues>(k: K, val: ConfigValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const sec = (k: keyof ConfigValues["security"], val: boolean | string) => setV((x) => ({ ...x, security: { ...x.security, [k]: val } }));

  function save() {
    start(async () => {
      const toIso = (s: string) => (s ? new Date(s).toISOString() : "");
      const res = await saveTestConfigAction(id, { ...v, startAt: toIso(v.startAt), endAt: toIso(v.endAt) });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Configuration saved");
        router.push(next);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Group title="Timing & availability">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-dur">Duration (minutes)</Label>
            <Input id="c-dur" type="number" min={1} value={v.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)} placeholder="Untimed" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-start">Start date</Label>
            <Input id="c-start" type="datetime-local" value={v.startAt} onChange={(e) => set("startAt", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-end">End date</Label>
            <Input id="c-end" type="datetime-local" value={v.endAt} onChange={(e) => set("endAt", e.target.value)} />
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Toggle label="Auto submit when time runs out" hint="The deadline is enforced on the server — reloading or closing the tab never adds time. Off = the timer is advisory and overtime is recorded." checked={v.autoSubmit && !!v.durationMinutes} disabled={!v.durationMinutes} onChange={(x) => set("autoSubmit", x)} />
        </div>
        <p className="text-[11px] text-muted-foreground">Leave dates empty for an always-open test; each assignment can add its own start and due dates inside this window. The end date always closes open attempts.</p>
      </Group>

      <Group title="Questions">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-qpa">Questions per attempt</Label>
            <Input id="c-qpa" type="number" min={1} value={v.questionsPerAttempt} onChange={(e) => set("questionsPerAttempt", e.target.value)} placeholder="All" />
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <Toggle label="Random question order" hint="Shuffles questions within each section, per attempt." checked={v.randomizeQuestions} onChange={(x) => set("randomizeQuestions", x)} />
          <Toggle label="Random option order" hint="Shuffles answer options (not True/False)." checked={v.randomizeOptions} onChange={(x) => set("randomizeOptions", x)} />
          <Toggle label="Negative marking" hint="Wrong answers lose each question's negative marks (sections can override)." checked={v.negativeMarking} onChange={(x) => set("negativeMarking", x)} />
        </div>
      </Group>

      <Group title="Passing">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Pass by</Label>
            <OptionSelect value={v.passMode} onChange={(x) => set("passMode", x)} options={[{ value: "percentage", label: "Percentage" }, { value: "marks", label: "Marks" }]} aria-label="Pass by" />
          </div>
          {v.passMode === "percentage" ? (
            <div className="space-y-1.5">
              <Label htmlFor="c-pp">Passing percentage</Label>
              <Input id="c-pp" type="number" min={0} max={100} value={v.passingPercentage} onChange={(e) => set("passingPercentage", e.target.value)} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="c-pm">Passing marks</Label>
              <Input id="c-pm" type="number" min={0} value={v.passingMarks} onChange={(e) => set("passingMarks", e.target.value)} />
            </div>
          )}
        </div>
      </Group>

      <Group title="Attempts">
        <div className="grid gap-2 md:grid-cols-3">
          <Toggle label="Allow retake" checked={v.allowRetake} onChange={(x) => set("allowRetake", x)} />
          <Toggle label="Only if failed" hint="A passed candidate cannot retake." checked={v.retakeOnlyIfFailed} disabled={!v.allowRetake} onChange={(x) => set("retakeOnlyIfFailed", x)} />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-max">Maximum attempts</Label>
            <Input id="c-max" type="number" min={1} max={50} value={v.allowRetake ? v.maxAttempts : "1"} disabled={!v.allowRetake} onChange={(e) => set("maxAttempts", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Result calculated from</Label>
            <OptionSelect value={v.attemptScoring} onChange={(x) => set("attemptScoring", x)} options={ATTEMPT_SCORING.map((a) => ({ value: a.value, label: a.label }))} aria-label="Attempt scoring" />
          </div>
        </div>
      </Group>

      <Group title="Navigation">
        <div className="grid gap-2 md:grid-cols-3">
          <Toggle label="Question navigation" hint="Jump to any question from the navigator. Off = strictly one after another." checked={v.allowNavigation} onChange={(x) => set("allowNavigation", x)} />
          <Toggle label="Back navigation" hint="Return to earlier questions and change answers." checked={v.allowBack} onChange={(x) => set("allowBack", x)} />
          <Toggle label="Review before submit" hint="Mark for review and see a summary before submitting." checked={v.allowReview} onChange={(x) => set("allowReview", x)} />
        </div>
      </Group>

      <Group title="Results">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>When candidates see their result</Label>
            <OptionSelect value={v.resultRelease} onChange={(x) => set("resultRelease", x)} options={RESULT_RELEASES.map((r) => ({ value: r.value, label: r.label }))} aria-label="Result release" />
            <p className="text-[11px] text-muted-foreground">{RESULT_RELEASES.find((r) => r.value === v.resultRelease)?.hint}</p>
          </div>
          <div className="space-y-1.5">
            <Label>What they see</Label>
            <OptionSelect value={v.resultDetail} onChange={(x) => set("resultDetail", x)} options={RESULT_DETAILS.map((r) => ({ value: r.value, label: r.label }))} aria-label="Result detail" />
            <p className="text-[11px] text-muted-foreground">{RESULT_DETAILS.find((r) => r.value === v.resultDetail)?.hint}</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <Toggle label="Show explanations" hint="With answers, once fully evaluated." checked={v.showExplanations} disabled={v.resultDetail === "score"} onChange={(x) => set("showExplanations", x)} />
        </div>
      </Group>

      <Group title="Exam security">
        <div className="grid gap-2 md:grid-cols-3">
          <Toggle label="Require full screen" hint="Asks for full screen; leaving it is recorded." checked={v.security.requireFullscreen} onChange={(x) => sec("requireFullscreen", x)} />
          <Toggle label="Detect tab / window changes" hint="Hiding the tab or switching windows is recorded." checked={v.security.detectTabSwitch} onChange={(x) => sec("detectTabSwitch", x)} />
          <Toggle label="Block copy / paste" hint="Blocked and recorded (code answers can still be typed)." checked={v.security.blockCopyPaste} onChange={(x) => sec("blockCopyPaste", x)} />
          <Toggle label="Block right-click" checked={v.security.blockRightClick} onChange={(x) => sec("blockRightClick", x)} />
          <Toggle label="One window / device at a time" hint="A second window must take over; the old one stops saving (recorded)." checked={v.security.singleSession} onChange={(x) => sec("singleSession", x)} />
          <div className="space-y-1.5 rounded-xl border border-border/50 px-3 py-2">
            <Label htmlFor="c-viol">Auto-submit after N violations</Label>
            <Input id="c-viol" type="number" min={1} value={v.security.maxViolations} onChange={(e) => sec("maxViolations", e.target.value)} placeholder="Record only" />
          </div>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          These controls deter and record suspicious behaviour; a browser-based exam cannot be made completely cheat-proof. IP address, device and every event are kept on the attempt and in the activity log.
        </p>
      </Group>

      <Button type="button" onClick={save} disabled={pending}>
        {pending && <Loader2 className="size-3.5 animate-spin" />} Save & continue
      </Button>
    </div>
  );
}
