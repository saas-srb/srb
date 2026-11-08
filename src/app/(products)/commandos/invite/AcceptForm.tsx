"use client";

import { useActionState, useId } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction, type AcceptState } from "./actions";

const initialState: AcceptState = {};

export default function AcceptForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [state, formAction, pending] = useActionState(acceptInvitationAction, initialState);
  const nameId = useId();
  const passwordId = useId();
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>Your name</Label>
        <Input id={nameId} name="name" required autoComplete="name" defaultValue={defaultName} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={passwordId}>Choose a password</Label>
        <Input id={passwordId} name="password" type="password" required minLength={10} autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">At least 10 characters.</p>
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Join workspace"}
      </Button>
    </form>
  );
}
