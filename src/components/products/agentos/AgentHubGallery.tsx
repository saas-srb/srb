"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AudioLines, Bot, MessageSquare, Pencil, Search, Clock, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/products/agentos/AibotsUi";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import AgentKindBadge from "@/components/products/agentos/AgentKindBadge";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { DEFAULT_HUB_FILTERS, filterHubAgents, hubCategories, kindCounts, type HubAgent, type HubFilters } from "@/lib/products/agentos/hub-filter";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

const KIND_TABS: { value: HubFilters["kind"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "text", label: "Text" },
  { value: "voice", label: "Voice" },
];

function AgentCard({ a }: { a: HubAgent }) {
  const voice = a.kind === "voice";
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/60 p-4 transition-colors hover:border-primary/30">
      <div className="flex items-start gap-3">
        <BotAvatar icon={a.icon} color={a.color} imageUrl={a.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-bold">{a.name}</h3>
            <AgentKindBadge kind={a.kind} />
            {a.status === "inactive" && <Badge variant="outline">Inactive</Badge>}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {a.category} · {voice ? a.voiceName ?? "Voice not set" : a.model}
          </p>
        </div>
      </div>
      <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">{a.description || "No description."}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3" />
          {a.lastUsedAt ? `Last used ${formatDate(a.lastUsedAt)}` : "Not used yet"}
        </span>
        <div className="flex items-center gap-1.5">
          {voice && (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/agentos/calls?bot=${encodeURIComponent(a._id)}`} />}>
              <History className="size-3.5" /> Calls
            </Button>
          )}
          {a.canEdit && (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/agentos/bots/${a._id}`} />}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          )}
          <Button size="sm" nativeButton={false} render={<Link href={`/agentos/b/${a._id}`} />}>
            {voice ? <AudioLines className="size-3.5" /> : <MessageSquare className="size-3.5" />} {voice ? "Talk" : "Chat"}
          </Button>
        </div>
      </div>
    </article>
  );
}

/** The Hub's gallery: kind tabs, search, category and status filters over the agents the server already scoped to this viewer. */
export default function AgentHubGallery({ agents, canCreate }: { agents: HubAgent[]; canCreate: boolean }) {
  const [f, setF] = useState<HubFilters>(DEFAULT_HUB_FILTERS);
  const categories = useMemo(() => hubCategories(agents), [agents]);
  const counts = useMemo(() => kindCounts(agents), [agents]);
  const shown = useMemo(() => filterHubAgents(agents, f), [agents, f]);
  const showStatus = agents.some((a) => a.status === "inactive");
  const filtered = f.q !== "" || f.category !== "" || f.status !== "all" || f.kind !== "all";

  if (agents.length === 0) {
    return (
      <EmptyState icon={<Bot className="size-5" />} title="No agents yet">
        {canCreate ? "Create the first text or voice agent and it will appear here for everyone it is shared with." : "No agents have been shared with you yet."}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Agent type" className="inline-flex rounded-xl border border-border/50 bg-background/60 p-0.5">
          {KIND_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={f.kind === t.value}
              onClick={() => setF((p) => ({ ...p, kind: t.value }))}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors", f.kind === t.value ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-primary")}
            >
              {t.label} <span className="ml-1 opacity-60">{counts[t.value]}</span>
            </button>
          ))}
        </div>
        <label className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-border/50 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground focus-within:border-primary/40">
          <Search className="size-3.5 shrink-0" />
          <input value={f.q} onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))} placeholder="Search agents" aria-label="Search agents" className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
        {categories.length > 1 && (
          <OptionSelect className="w-44" aria-label="Category" value={f.category} noneLabel="All categories" options={categories.map((c) => ({ value: c, label: c }))} onChange={(c) => setF((p) => ({ ...p, category: c }))} />
        )}
        {showStatus && (
          <OptionSelect
            className="w-36"
            aria-label="Status"
            value={f.status === "all" ? "" : f.status}
            noneLabel="Any status"
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            onChange={(s) => setF((p) => ({ ...p, status: s === "active" || s === "inactive" ? s : "all" }))}
          />
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<Search className="size-5" />} title="No agent matches">
          {filtered ? (
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => setF(DEFAULT_HUB_FILTERS)}>
              Clear filters
            </button>
          ) : null}
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => (
            <AgentCard key={a._id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}
