"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** A person's "do not contact" decision for one record. The action is the product's own server action; every outbound AI call to this person is then refused. */
export default function DoNotContactSwitch({ initial, who, action }: { initial: boolean; who: string; action: (next: boolean) => Promise<{ error?: string }> }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  function toggle() {
    const next = !on;
    start(async () => {
      const res = await action(next);
      if (res.error) return void toast.error(res.error);
      setOn(next);
      toast.success(next ? `${who} will not be called by AI agents.` : `${who} can be called again.`);
    });
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
      <div>
        <p className="font-medium">{on ? "Do not contact" : "Contactable"}</p>
        <p className="text-xs text-muted-foreground">{on ? `${who} asked not to be contacted. AI calls to this number are blocked.` : `Turn on if ${who} asks not to be called.`}</p>
      </div>
      <Button size="sm" variant={on ? "default" : "outline"} onClick={toggle} disabled={pending}>{on ? "Allow contact" : "Mark do not contact"}</Button>
    </div>
  );
}
