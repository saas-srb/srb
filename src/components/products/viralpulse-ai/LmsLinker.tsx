"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Link an SMMS campaign to the LMS campaigns whose imported ad-platform data belongs to it. */
export default function LmsLinker({ options, selected, save }: { options: { key: string; name: string; platform: string }[]; selected: string[]; save: (keys: string[]) => Promise<{ ok: boolean; error?: string }> }) {
  const router = useRouter();
  const [keys, setKeys] = useState(selected);
  const [pending, start] = useTransition();
  if (options.length === 0) return <p className="text-xs text-muted-foreground">No ad-platform data has been imported into DealFlow → Campaigns yet. Import a Meta / Google / LinkedIn performance CSV there, then link it here.</p>;
  return (
    <div className="space-y-2">
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border/50 p-2">
        {options.map((o) => (
          <label key={o.key} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={keys.includes(o.key)} onChange={(e) => setKeys((k) => (e.target.checked ? [...k, o.key] : k.filter((x) => x !== o.key)))} />
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            <span className="text-[11px] text-muted-foreground uppercase">{o.platform}</span>
          </label>
        ))}
      </div>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await save(keys); if (!r.ok) toast.error(r.error ?? "Failed"); else { toast.success("Links saved."); router.refresh(); } })}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />} Save links
      </Button>
    </div>
  );
}
