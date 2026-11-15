"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Inbox } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { resolveAccessRequestAction } from "./actions";

export interface RequestRow {
  id: string;
  userId: string;
  who: string;
  email: string;
  label: string;
  message: string;
  at: string;
}

/** People who asked for something they have no access to. Review opens their edit page; Dismiss tells them it was not approved. */
export default function AccessRequestsPanel({ rows }: { rows: RequestRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (rows.length === 0) return null;
  const done = (id: string, status: "granted" | "dismissed") =>
    start(async () => {
      const r = await resolveAccessRequestAction(id, status);
      if (r.ok) { toast.success(status === "granted" ? "Marked as handled." : "Dismissed."); router.refresh(); } else toast.error(r.error ?? "Could not update the request.");
    });
  return (
    <section aria-label="Access requests" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Inbox className="size-4" aria-hidden />Access requests ({rows.length})</h2>
      <ul className="divide-y divide-border/40">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-sm">
              <p><span className="font-medium">{r.who}</span> asked for <span className="font-medium">{r.label}</span></p>
              <p className="text-xs text-muted-foreground">{r.email} · {r.at}{r.message ? ` · "${r.message}"` : ""}</p>
            </div>
            <div className="flex gap-2">
              <Link href={`/commandos/users/${r.userId}/edit?request=${r.id}`} className={buttonVariants({ size: "sm" })}>Review and give access</Link>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => done(r.id, "granted")}>Mark handled</Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => done(r.id, "dismissed")}>Dismiss</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
