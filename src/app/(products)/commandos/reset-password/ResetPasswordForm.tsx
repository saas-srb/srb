"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { resetPasswordAction, type ResetState } from "./actions";

const initial: ResetState = {};

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  const [show, setShow] = useState(false);
  return (
    <GlassCard>
      <CardHeader>
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>At least 10 characters, not a common password. You will be signed out everywhere and asked to sign in with the new one.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-1.5">
            <Label htmlFor="reset-next">New password</Label>
            <div className="relative">
              <Input id="reset-next" name="next" type={show ? "text" : "password"} required minLength={10} maxLength={200} autoComplete="new-password" autoFocus className="pr-9" />
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => setShow((v) => !v)} className="absolute top-1/2 right-1 -translate-y-1/2" aria-label={show ? "Hide passwords" : "Show passwords"} tabIndex={-1}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm">Confirm new password</Label>
            <Input id="reset-confirm" name="confirm" type={show ? "text" : "password"} required minLength={10} maxLength={200} autoComplete="new-password" />
          </div>
          {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Set new password"}</Button>
        </form>
      </CardContent>
    </GlassCard>
  );
}
