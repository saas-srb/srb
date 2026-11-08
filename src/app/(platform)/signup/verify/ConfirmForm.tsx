"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmSignupAction, type ConfirmState } from "../actions";

const initialState: ConfirmState = {};

export default function ConfirmForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(confirmSignupAction, initialState);

  if (state.awaitingApproval) {
    return <p className="text-sm text-muted-foreground">Thanks — your workspace request is with our team for approval. We&apos;ll email you as soon as it&apos;s ready.</p>;
  }
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Setting up your workspace…
          </>
        ) : (
          "Create my workspace"
        )}
      </Button>
    </form>
  );
}
