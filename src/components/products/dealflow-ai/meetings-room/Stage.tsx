"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { AgentTile, PersonTile } from "./Tiles";
import type { Layout, RoomAgent, RoomPerson } from "./types";

type Item = { key: string; kind: "person"; person: RoomPerson } | { key: string; kind: "agent"; agent: RoomAgent };

function gridClass(n: number): string {
  if (n <= 1) return "grid-cols-1";
  if (n === 2) return "grid-cols-1 sm:grid-cols-2";
  if (n <= 4) return "grid-cols-2";
  if (n <= 9) return "grid-cols-2 lg:grid-cols-3";
  return "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
}

/** Gallery or spotlight. Spotlight follows a pin, else a screen share, else whoever spoke last. */
export function Stage({
  people, agents, layout, version, canHost, caption, onMuteAgent, onRemoveAgent,
}: {
  people: RoomPerson[];
  agents: RoomAgent[];
  layout: Layout;
  version: number;
  canHost: boolean;
  caption?: string;
  onMuteAgent: (a: RoomAgent) => void;
  onRemoveAgent: (a: RoomAgent) => void;
}) {
  const [pinned, setPinned] = useState<string | null>(null);
  const [lastActive, setLastActive] = useState<string | null>(null);

  const items: Item[] = useMemo(
    () => [...people.map((p): Item => ({ key: `p:${p.identity}`, kind: "person", person: p })), ...agents.filter((a) => a.available).map((a): Item => ({ key: `a:${a.id}`, kind: "agent", agent: a }))],
    [people, agents],
  );

  const speakerKey = useMemo(() => {
    const a = agents.find((x) => x.state === "speaking");
    if (a) return `a:${a.id}`;
    const p = people.find((x) => x.speaking);
    return p ? `p:${p.identity}` : null;
  }, [people, agents]);
  // Remember the last active speaker (derived during render, not in an effect).
  if (speakerKey && speakerKey !== lastActive) setLastActive(speakerKey);

  // A pin to someone who left falls back to automatic.
  const pinValid = pinned && items.some((i) => i.key === pinned) ? pinned : null;
  const share = people.find((p) => p.sharing);
  const autoKey = (share ? `p:${share.identity}` : null) ?? (lastActive && items.some((i) => i.key === lastActive) ? lastActive : null) ?? items.find((i) => i.kind === "person" && !i.person.isLocal)?.key ?? items[0]?.key ?? null;
  const focusKey = pinValid ?? autoKey;
  const togglePin = (key: string) => setPinned((cur) => (cur === key ? null : key));

  const render = (it: Item, compact: boolean) =>
    it.kind === "person" ? (
      <PersonTile key={it.key} person={it.person} version={version} compact={compact} pinned={pinValid === it.key} onPin={() => togglePin(it.key)} caption={caption} />
    ) : (
      <AgentTile key={it.key} agent={it.agent} compact={compact} pinned={pinValid === it.key} onPin={() => togglePin(it.key)} canHost={canHost} onMute={() => onMuteAgent(it.agent)} onRemove={() => onRemoveAgent(it.agent)} />
    );

  if (layout === "spotlight" && items.length > 1 && focusKey) {
    const main = items.find((i) => i.key === focusKey) ?? items[0];
    const rest = items.filter((i) => i.key !== main.key);
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 p-2 sm:gap-3 sm:p-3 lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1">{render(main, false)}</div>
        <div className={cn("flex shrink-0 gap-2 overflow-auto lg:w-56 lg:flex-col", "h-24 lg:h-auto")} role="list" aria-label="Other participants">
          {rest.map((it) => (
            <div key={it.key} role="listitem" className="h-full min-w-36 shrink-0 lg:h-32 lg:min-w-0">
              {render(it, true)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2 sm:p-3">
      <div className={cn("grid min-h-full gap-2 sm:gap-3", gridClass(items.length), items.length <= 6 ? "auto-rows-[minmax(150px,1fr)]" : "auto-rows-[minmax(140px,1fr)]")} role="list" aria-label="Participants">
        {items.map((it) => (
          <div key={it.key} role="listitem" className="min-h-0">
            {render(it, items.length > 9)}
          </div>
        ))}
      </div>
    </div>
  );
}
