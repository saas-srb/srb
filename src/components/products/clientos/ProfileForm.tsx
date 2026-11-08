"use client";

import { useActionState, useId } from "react";
import { Loader2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updatePortalProfileAction, type ProfileState } from "@/app/(products)/clientos/(app)/profile/actions";

const initial: ProfileState = {};

export default function ProfileForm({ displayName, phone }: { displayName: string; phone: string }) {
  const [state, action, pending] = useActionState(updatePortalProfileAction, initial);
  const nameId = useId();
  const phoneId = useId();

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>Full name</Label>
        <Input id={nameId} name="displayName" defaultValue={displayName} required minLength={2} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={phoneId}>Phone</Label>
        <Input id={phoneId} name="phone" defaultValue={phone} required inputMode="tel" />
        <p className="text-xs text-muted-foreground">Used to verify your identity if you ever reset your password.</p>
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
      {state?.ok && (
        <p className="flex items-center gap-1 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-400">
          <Check className="size-4" /> Profile updated.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
      </Button>
    </form>
  );
}
