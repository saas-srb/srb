"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Runs a long SEO job (audit, Search Console sync, PageSpeed, backlink
 * verification…) through its API route, which has a five-minute budget, then
 * refreshes the page. The button stays busy for the whole run.
 */
function fill(template: string, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(r[k] ?? 0));
}

export default function JobButton({
  endpoint = "/api/rankmax-ai/jobs",
  body,
  label,
  busyLabel,
  icon,
  variant = "outline",
  size = "sm",
  successMessage,
  disabled,
}: {
  endpoint?: string;
  body?: Record<string, unknown>;
  label: string;
  busyLabel?: string;
  icon?: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "sm" | "default" | "xs";
  /** Toast on success; `{field}` placeholders are filled from the job result (a function can't cross the server→client boundary). */
  successMessage?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; result?: unknown; runId?: string };
      if (!res.ok || data.ok === false) {
        toast.error(data.error ?? `Failed (HTTP ${res.status})`);
      } else {
        toast.success(fill(successMessage ?? "Done", data.result ?? data));
        if (data.runId) router.push(`/rankmax-ai/audit/${data.runId}`);
        else router.refresh();
      }
    } catch {
      toast.error("Network error — the job may still be running. Refresh in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={go} disabled={busy || disabled}>
      {busy ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : icon}
      {busy ? busyLabel ?? "Working…" : label}
    </Button>
  );
}
