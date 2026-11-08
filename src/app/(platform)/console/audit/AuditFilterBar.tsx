"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const selectClass =
  "h-9 w-full rounded-xl border border-border/50 bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-44 dark:bg-input/30";

type Initial = { actor: string; action: string; company: string; from: string; to: string; q: string };

export default function AuditFilterBar({ initial, actors, actions, companies }: { initial: Initial; actors: { id: string; label: string }[]; actions: string[]; companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initial.q);

  function update(updates: Partial<Record<keyof Initial, string>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (q !== initial.q) update({ q });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const field = (id: string, label: string, control: React.ReactNode) => (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {control}
    </div>
  );

  return (
    <>
      {field(
        "audit-q",
        "Search",
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input id="audit-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Action, target, actor or company" className="h-9 w-full rounded-xl border-border/50 bg-background pl-8 sm:w-64" />
        </div>,
      )}
      {field(
        "audit-actor",
        "Actor",
        <select id="audit-actor" className={selectClass} value={initial.actor} onChange={(e) => update({ actor: e.target.value })}>
          <option value="">Anyone</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>,
      )}
      {field(
        "audit-action",
        "Action",
        <select id="audit-action" className={selectClass} value={initial.action} onChange={(e) => update({ action: e.target.value })}>
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a.includes(".") ? a : `${a}.*`}
            </option>
          ))}
        </select>,
      )}
      {field(
        "audit-company",
        "Company",
        <select id="audit-company" className={selectClass} value={initial.company} onChange={(e) => update({ company: e.target.value })}>
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>,
      )}
      {field("audit-from", "From", <Input id="audit-from" type="date" value={initial.from} onChange={(e) => update({ from: e.target.value })} className="h-9 w-full rounded-xl border-border/50 bg-background sm:w-40" />)}
      {field("audit-to", "To", <Input id="audit-to" type="date" value={initial.to} onChange={(e) => update({ to: e.target.value })} className="h-9 w-full rounded-xl border-border/50 bg-background sm:w-40" />)}
    </>
  );
}
