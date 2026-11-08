"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SignupMode } from "@/lib/platform/settings";
import { setSignupModeAction } from "./actions";

const MODES: { value: SignupMode; label: string; description: string }[] = [
  { value: "open", label: "Open", description: "Anyone can sign up. A workspace is created as soon as they confirm their email." },
  { value: "approval", label: "Approval required", description: "Anyone can sign up, but after confirming their email the request waits here until a Director approves it." },
  { value: "closed", label: "Closed", description: "The sign-up page stops accepting new companies. Existing workspaces are unaffected." },
];

export default function SignupModeForm({ initial, canManage = true }: { initial: SignupMode; canManage?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<SignupMode>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMessage(null);
    start(async () => {
      const res = await setSignupModeAction(mode);
      setMessage(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div id="signup-mode" role="radiogroup" aria-label="Sign-up mode" className="grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={cn(
              "cursor-pointer rounded-xl border p-3 text-sm transition-colors",
              mode === m.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
            )}
          >
            <input type="radio" name="signupMode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} disabled={!canManage} className="sr-only" />
            <span className="block font-semibold text-foreground">{m.label}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{m.description}</span>
          </label>
        ))}
      </div>
      {canManage && (
      <div className="flex items-center gap-3">
        <Button id="signup-mode-save" type="button" onClick={save} disabled={pending || mode === initial}>
          {pending ? "Saving…" : "Save sign-up mode"}
        </Button>
        {message && <p className={cn("text-sm", message.ok ? "text-muted-foreground" : "text-destructive")}>{message.text}</p>}
      </div>
      )}
    </div>
  );
}
