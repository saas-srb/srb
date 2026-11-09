"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sealNowAction } from "@/app/(products)/contractflow-ai/(protected)/clones/list-actions";

/** Shown on a fully signed document that has no signed copy yet. */
export default function SealButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await sealNowAction(id); if (!r.ok) { toast.error(r.message); return; } toast.success("The signed copy was made and emailed."); router.refresh(); })}>
      {pending ? "Making the signed copy…" : "Make the signed copy"}
    </Button>
  );
}
