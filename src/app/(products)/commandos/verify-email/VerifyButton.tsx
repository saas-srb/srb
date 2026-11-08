"use client";

import { useFormStatus } from "react-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The submit button of the verification form: shows progress while the browser posts, and can't be double-clicked. */
export default function VerifyButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-11 w-full gap-2 text-sm font-semibold">
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Verifying…
        </>
      ) : (
        <>
          <ShieldCheck className="size-4" /> Verify my email
        </>
      )}
    </Button>
  );
}
