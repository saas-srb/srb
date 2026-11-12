"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { testSettingAction } from "./actions";
import type { MissingItem } from "@/lib/platform/setup/missing";

/** Staff-only guided checklist of settings that were environment-only and are empty now: where to fill each in, a Test, and where to get the key. */
export default function MissingSettings({ items, canManage }: { items: MissingItem[]; canManage: boolean }) {
  const [res, setRes] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const open = items.filter((i) => !i.configured).length;
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">Missing settings{open ? ` (${open})` : ""}</CardTitle>
        <CardDescription>Everything the platform needs that used to live only in the old deployment&apos;s environment. Fill each in under Integrations; nothing needs a redeploy.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((i) => (
            <li key={i.id} className="space-y-1 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  {i.configured ? <CircleCheck className="size-4 text-emerald-600" /> : <TriangleAlert className="size-4 text-amber-600" />}
                  {i.title}
                  <span className="text-xs font-normal text-muted-foreground">{i.configured ? "saved" : "missing"}</span>
                </span>
                <span className="flex gap-2">
                  <Link href={i.href} className="inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium hover:border-primary/40">{i.configured ? "Open" : "Fill in"}</Link>
                  {i.testable && canManage && (
                    <Button size="sm" variant="outline" disabled={busy === i.id || !i.configured} onClick={() => { setBusy(i.id); start(async () => { const r = await testSettingAction(i.id); setRes((x) => ({ ...x, [i.id]: r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error } })); setBusy(null); }); }}>
                      {busy === i.id ? "Testing…" : "Test"}
                    </Button>
                  )}
                </span>
              </div>
              {!i.configured && <p className="text-xs text-muted-foreground">{i.hint}</p>}
              {res[i.id] && <p role="status" className={res[i.id].ok ? "text-xs text-emerald-600" : "text-xs text-destructive"}>{res[i.id].text}</p>}
            </li>
          ))}
        </ul>
      </CardContent>
    </GlassCard>
  );
}
