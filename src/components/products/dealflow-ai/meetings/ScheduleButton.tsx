"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import ScheduleMeeting, { GuestLinksDialog, type CreatedResult } from "./ScheduleMeeting";
import type { AgentOption } from "@/lib/products/agentos/picker-types";
import type { StaffOption } from "@/lib/dealflow-ai/meetings/service";

/** The header's primary action: opens the scheduling panel, then shows the one-time guest links. */
export default function ScheduleButton({ staff, agents, me }: { staff: StaffOption[]; agents: AgentOption[]; me: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedResult | null>(null);
  const router = useRouter();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />Schedule meeting</Button>
      <ScheduleMeeting key={open ? "open" : "closed"} open={open} onClose={() => setOpen(false)} staff={staff} agents={agents} me={me} onCreated={(r) => { setOpen(false); setCreated(r); router.refresh(); }} onUpdated={() => undefined} />
      {created && <GuestLinksDialog result={created} onClose={() => setCreated(null)} />}
    </>
  );
}
