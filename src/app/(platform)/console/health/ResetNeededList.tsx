"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { resetCompanyTwoStepAction } from "./actions";

export interface ResetRow {
  id: string;
  companyId: string;
  companyName: string;
  email: string;
  maskedEmail: string;
  firstSeenAt: string;
  seen: number;
}

/** Staff only: people whose authenticator can't be checked on this deployment, each with a one-click reset. */
export default function ResetNeededList({ rows, canReset }: { rows: ResetRow[]; canReset: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (rows.length === 0) return null;
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">Two-step reset needed ({rows.length})</CardTitle>
        <CardDescription>These people tried to sign in but their authenticator can&apos;t be checked here. They were offered recovery options (recovery code, emailed code). Resetting clears it; they set it up again at their next sign-in.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-medium">{r.email}</span>
                <span className="block text-xs text-muted-foreground">{r.companyName} · first seen {new Date(r.firstSeenAt).toLocaleString()} · {r.seen} attempt(s)</span>
              </span>
              <Button size="sm" variant="outline" disabled={pending || !canReset} onClick={() => start(async () => { const res = await resetCompanyTwoStepAction({ company: r.companyId, email: r.email }); if (res.ok) toast.success(res.message); else toast.error(res.error); router.refresh(); })}>
                Reset now
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </GlassCard>
  );
}
