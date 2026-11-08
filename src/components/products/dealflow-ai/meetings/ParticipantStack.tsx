"use client";

import { Bot } from "lucide-react";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import type { AgentOption } from "@/lib/products/agentos/picker-types";
import type { MeetingParticipantView } from "@/lib/dealflow-ai/meetings/types";
import { initials } from "@/lib/dealflow-ai/meetings/ui";
import { cn } from "@/lib/utils";

export function agentFor(p: Pick<MeetingParticipantView, "refId">, agents: AgentOption[]): AgentOption | undefined {
  return agents.find((a) => a.id === p.refId);
}

export function PersonAvatar({ name, tone, size = "md" }: { name: string; tone: "staff" | "guest"; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-10 text-sm" }[size];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-background", box, tone === "staff" ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-700 dark:text-amber-300")} title={name}>
      {initials(name)}
    </span>
  );
}

export function AgentAvatar({ p, agents, size = "md" }: { p: MeetingParticipantView; agents: AgentOption[]; size?: "sm" | "md" | "lg" }) {
  const a = agentFor(p, agents);
  if (!a) return <span className={cn("inline-flex shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-2 ring-background", { sm: "size-6", md: "size-8", lg: "size-10" }[size])} title="Agent no longer available"><Bot className="size-3.5" /></span>;
  return <BotAvatar icon={a.icon} color={a.color} imageUrl={a.avatarUrl} size={size} className="ring-2 ring-background" />;
}

function Group({ label, children, count }: { label: string; children: React.ReactNode; count: number }) {
  if (!count) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex -space-x-2">{children}</div>
    </div>
  );
}

/** Avatars grouped by kind: team, guests and AI agents (with their photo). */
export default function ParticipantStack({ participants, agents, max = 5 }: { participants: MeetingParticipantView[]; agents: AgentOption[]; max?: number }) {
  const staff = participants.filter((p) => p.kind === "internal");
  const guests = participants.filter((p) => p.kind === "external");
  const bots = participants.filter((p) => p.kind === "agent");
  const more = (n: number) => (n > max ? <span className="z-0 inline-flex size-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background">+{n - max}</span> : null);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <Group label="Team" count={staff.length}>{staff.slice(0, max).map((p) => <PersonAvatar key={p.id} name={p.name} tone="staff" />)}{more(staff.length)}</Group>
      <Group label="Guests" count={guests.length}>{guests.slice(0, max).map((p) => <PersonAvatar key={p.id} name={p.name} tone="guest" />)}{more(guests.length)}</Group>
      <Group label="AI" count={bots.length}>{bots.slice(0, max).map((p) => <AgentAvatar key={p.id} p={p} agents={agents} />)}{more(bots.length)}</Group>
    </div>
  );
}
