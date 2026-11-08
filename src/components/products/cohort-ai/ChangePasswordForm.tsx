"use client";

import { useActionState, useId, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { changeTmsPasswordAction, type ChangePasswordState } from "@/app/(products)/cohort-ai/change-password/actions";

const initial: ChangePasswordState = {};

export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, formAction, pending] = useActionState(changeTmsPasswordAction, initial);
  const [show, setShow] = useState(false);
  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();

  return (
    <GlassCard>
      <CardHeader>
        <CardTitle className="text-xl">{forced ? "Set a new password" : "Change your password"}</CardTitle>
        <CardDescription>
          {forced
            ? "Your account was created with a temporary password. Choose your own to continue."
            : "Pick a password you don't use anywhere else. Minimum 10 characters."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={currentId}>Current password</Label>
            <Input id={currentId} name="current" type={show ? "text" : "password"} required autoComplete="current-password" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={nextId}>New password</Label>
            <div className="relative">
              <Input id={nextId} name="next" type={show ? "text" : "password"} required minLength={10} autoComplete="new-password" className="pr-9" />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setShow((v) => !v)}
                className="absolute top-1/2 right-1 -translate-y-1/2"
                aria-label={show ? "Hide passwords" : "Show passwords"}
                tabIndex={-1}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={confirmId}>Confirm new password</Label>
            <Input id={confirmId} name="confirm" type={show ? "text" : "password"} required minLength={10} autoComplete="new-password" />
          </div>
          {state?.error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Update password"}
          </Button>
        </form>
      </CardContent>
    </GlassCard>
  );
}
