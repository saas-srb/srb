"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setLeadDoNotContactAction } from "../actions";

/** Marks a lead as having asked not to be contacted; DealFlow's email and WhatsApp sends then refuse them. */
export default function DoNotContactToggle({ leadId, doNotContact }: { leadId: string; doNotContact: boolean }) {
  const [pending, start] = useTransition();
  function toggle() {
    start(async () => {
      const res = await setLeadDoNotContactAction(leadId, !doNotContact);
      if (res.error) return void toast.error(res.error);
      toast.success(doNotContact ? "This lead can be contacted again." : "Marked do not contact. Email and WhatsApp sends are blocked.");
    });
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
      <div>
        <p className="font-medium">{doNotContact ? "Do not contact" : "Contactable"}</p>
        <p className="text-xs text-muted-foreground">{doNotContact ? "This lead asked not to be contacted by email or WhatsApp." : "Turn on if the lead asks to stop receiving messages."}</p>
      </div>
      <Button size="sm" variant={doNotContact ? "default" : "outline"} onClick={toggle} disabled={pending}>
        {doNotContact ? "Allow contact" : "Mark do not contact"}
      </Button>
    </div>
  );
}
