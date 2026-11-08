"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, PhoneIncoming, PhoneOutgoing, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ActionButton from "@/components/products/agentos/ActionButton";
import AgentPicker from "@/components/products/agentos/AgentPicker";
import { EmptyState } from "@/components/products/agentos/AibotsUi";
import { assignInboundAgentAction, importNumberAction, removeNumberAction } from "@/app/(products)/commandos/(protected)/settings/products/agentos/phone-actions";
import type { PhoneNumberView } from "@/lib/products/agentos/calls/numbers";
import type { AgentOption } from "@/lib/products/agentos/picker-types";

/** The company's phone numbers: import from its own Twilio account, choose which voice agent answers each one, remove. */
export default function PhoneNumbers({ numbers, agents, canImport }: { numbers: PhoneNumberView[]; agents: AgentOption[]; canImport: boolean }) {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  const [assigning, setAssigning] = useState<string | null>(null);
  const agentName = (id: string | null) => (id ? (agents.find((a) => a.id === id)?.name ?? "An agent you can't see") : null);

  const add = () =>
    start(async () => {
      const r = await importNumberAction({ number, label });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Number added. You can now call from it and assign an agent to answer it.");
      setNumber("");
      setLabel("");
      router.refresh();
    });

  const assign = async (n: PhoneNumberView, agentId: string) => {
    setAssigning(n.id);
    const r = await assignInboundAgentAction(n.id, agentId || null);
    setAssigning(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(agentId ? "Incoming calls on this number now go to that agent." : "This number no longer answers incoming calls.");
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {numbers.length === 0 ? (
        <EmptyState icon={<PhoneOutgoing className="size-5" />} title="No phone numbers yet">
          {canImport ? "Add a number from your Twilio account below. Without one, no call can be placed." : "Connect Twilio first, then add a number here."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border/40">
          {numbers.map((n) => (
            <li key={n.id} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)_auto] md:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{n.label}</p>
                <p className="font-mono text-xs text-muted-foreground">{n.number}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="ghost" className="bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300">Active</Badge>
                  {n.supportsOutbound && <Badge variant="outline"><PhoneOutgoing />Outbound</Badge>}
                  {n.supportsInbound && <Badge variant="outline"><PhoneIncoming />Inbound</Badge>}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Answers incoming calls</Label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <AgentPicker agents={agents} value={n.assignedAgentId ?? ""} onChange={(id) => void assign(n, id)} noneLabel="Nobody (calls ring out)" placeholder="Choose an agent" disabled={assigning === n.id} aria-label={`Agent that answers ${n.label}`} />
                  </div>
                  {assigning === n.id && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
                </div>
                {n.assignedAgentId && !agents.some((a) => a.id === n.assignedAgentId) && <p className="text-[11px] text-amber-700 dark:text-amber-300">{agentName(n.assignedAgentId)} is switched off or deleted. Pick another agent.</p>}
              </div>
              <ActionButton
                action={() => removeNumberAction(n.id)}
                success="Number removed"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                confirm={{ title: `Remove ${n.label}?`, description: `${n.number} will be removed from AgentOS and from ElevenLabs. Calls can't go out from it or come in on it until you add it again. Your Twilio number itself is not deleted.`, confirmLabel: "Remove number" }}
              >
                <Trash2 className="size-3.5" />Remove
              </ActionButton>
            </li>
          ))}
        </ul>
      )}

      {canImport && (
        <form
          className="rounded-2xl border border-border/50 bg-muted/20 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <p className="text-sm font-semibold">Add a number from Twilio</p>
          <p className="mb-3 text-xs text-muted-foreground">The number must already be in your own Twilio account. It is imported into ElevenLabs so agents can call from it and answer it.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="pn-number">Number (with country code)</Label>
              <Input id="pn-number" type="tel" inputMode="tel" autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value)} disabled={pending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pn-label">Name your team will recognise</Label>
              <Input id="pn-label" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} disabled={pending} />
            </div>
            <Button type="submit" disabled={pending || !number.trim() || !label.trim()}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Add number</Button>
          </div>
        </form>
      )}
    </div>
  );
}
