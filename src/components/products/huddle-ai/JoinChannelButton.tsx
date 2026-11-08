"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { joinChannelAction } from "@/app/(products)/huddle-ai/(protected)/channels/actions";

export default function JoinChannelButton({ slug, label = "Join" }: { slug: string; label?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => void joinChannelAction(slug))}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : label}
    </Button>
  );
}
