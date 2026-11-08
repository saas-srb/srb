"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { publishSopAction } from "@/app/(products)/playbook-ai/(protected)/actions";
import { cn } from "@/lib/utils";

/**
 * Direct publish — no approval step. The first publish is v1.0; later
 * publishes are a minor (1.1) or major (2.0) bump with a required change
 * summary, and can re-open acknowledgements for everyone assigned.
 */
export default function PublishDialog({
  sopId,
  currentVersion,
  reackDefault,
  assignedCount,
  beforePublish,
  trigger,
}: {
  sopId: string;
  currentVersion: string | null;
  reackDefault: boolean;
  assignedCount: number;
  /** Lets the editor save unsaved edits first; return false to abort. */
  beforePublish?: () => Promise<boolean>;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [changeType, setChangeType] = useState<"minor" | "major">("minor");
  const [summary, setSummary] = useState("");
  const [reack, setReack] = useState(reackDefault);
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isFirst = !currentVersion;
  const [maj, min] = (currentVersion ?? "0.0").split(".").map(Number);
  const next = isFirst ? "1.0" : changeType === "major" ? `${maj + 1}.0` : `${maj}.${min + 1}`;

  function submit() {
    setError(null);
    startTransition(async () => {
      if (beforePublish && !(await beforePublish())) return;
      const res = await publishSopAction(sopId, { changeType, changeSummary: summary, requireReack: reack, reackDueDate: reack && due ? due : null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(`Published v${res.version}`);
      setOpen(false);
      setSummary("");
      router.push(`/playbook-ai/library/${sopId}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<span className="contents" />}>
        {trigger ?? (
          <Button type="button" size="sm">
            <Rocket className="size-3.5" data-icon="inline-start" />
            {isFirst ? "Publish" : "Publish new version"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isFirst ? "Publish SOP" : `Publish new version (v${currentVersion} → v${next})`}</DialogTitle>
          <DialogDescription>
            {isFirst ? "It goes live immediately as v1.0 (or becomes Published until its effective date)." : "The previous version stays in the history and can be compared at any time."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-1">
          {!isFirst && (
            <div className="grid grid-cols-2 gap-2">
              {(["minor", "major"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setChangeType(t)}
                  className={cn("rounded-xl border px-3 py-2 text-left text-sm transition-colors", changeType === t ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}
                >
                  <span className="block font-semibold capitalize">{t} change</span>
                  <span className="block text-xs text-muted-foreground">{t === "minor" ? `Small edits → v${maj}.${(min || 0) + 1}` : `Significant rewrite → v${maj + 1}.0`}</span>
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pub-summary">Change summary{isFirst ? " (optional)" : ""}</Label>
            <Textarea id="pub-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={1000} placeholder={isFirst ? "Initial release" : "What changed and why?"} />
          </div>
          {!isFirst && (
            <div className="space-y-2 rounded-xl border border-border/60 p-3">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={reack} onChange={(e) => setReack(e.target.checked)} />
                <span>
                  <span className="font-medium">Require re-acknowledgement</span>
                  <span className="block text-xs text-muted-foreground">
                    {assignedCount > 0 ? `Re-opens acknowledgement for ${assignedCount} assigned ${assignedCount === 1 ? "person" : "people"}.` : "No one is assigned yet, so this has no effect."}
                  </span>
                </span>
              </label>
              {reack && assignedCount > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="pub-due" className="text-xs">New due date (optional — defaults to your settings)</Label>
                  <Input id="pub-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                </div>
              )}
            </div>
          )}
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : `Publish v${next}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
