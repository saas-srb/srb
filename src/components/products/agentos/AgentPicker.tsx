"use client";

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import AgentKindBadge from "@/components/products/agentos/AgentKindBadge";
import type { AgentOption } from "@/lib/products/agentos/picker-types";

/**
 * Reusable agent select for every product. `agents` comes from the server function `listAgentsFor()` in
 * `@/lib/products/agentos/picker` (the contract is documented there); nothing is hardcoded here.
 * `value` is the agent id, "" when nothing is chosen.
 */
export default function AgentPicker({
  agents,
  value,
  onChange,
  placeholder = "Select an agent",
  noneLabel,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  agents: AgentOption[];
  value: string;
  onChange: (agentId: string) => void;
  placeholder?: string;
  /** When set, adds a leading "no agent" option with this label. */
  noneLabel?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const NONE = "__none__";
  const items = [...(noneLabel ? [{ value: NONE, label: noneLabel }] : []), ...agents.map((a) => ({ value: a.id, label: a.name }))];
  return (
    <Select items={items} value={value === "" && noneLabel ? NONE : value || null} onValueChange={(v) => onChange(!v || v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger id={id} className={className ?? "w-full"} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {agents.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <span className="flex min-w-0 items-center gap-2">
              <BotAvatar icon={a.icon} color={a.color} imageUrl={a.avatarUrl} size="sm" />
              <span className="truncate">{a.name}</span>
              <AgentKindBadge kind={a.kind} />
            </span>
          </SelectItem>
        ))}
        {agents.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No agents available to you yet.</div>}
      </SelectContent>
    </Select>
  );
}
