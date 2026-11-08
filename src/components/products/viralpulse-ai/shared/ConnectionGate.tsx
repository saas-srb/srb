import type { ReactNode } from "react";
import Link from "next/link";
import { Plug } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const CONNECTED_ACCOUNTS_HREF = "/viralpulse-ai/settings?tab=integrations";

export interface GateRequirement {
  /** Plain name of the account, e.g. "Instagram", "Facebook Page", "OpenAI". */
  name: string;
  connected: boolean;
  /** Optional: why this flow needs it, e.g. "to publish this post". */
  why?: string;
}

/**
 * Blocks a flow until the accounts it needs are connected. Renders `children` only when every requirement is met; otherwise a
 * plain explanation of what is missing and a link to Settings > Connected accounts. The caller supplies real connection state
 * (from `listIntegrationViews()` or `isOpenAIConfigured()`); nothing here guesses.
 */
export default function ConnectionGate({ requires, children, settingsHref = CONNECTED_ACCOUNTS_HREF, canManage = true, className }: { requires: GateRequirement[]; children: ReactNode; settingsHref?: string; canManage?: boolean; className?: string }) {
  const missing = requires.filter((r) => !r.connected);
  if (missing.length === 0) return <>{children}</>;
  const names = missing.map((m) => m.name).join(", ");
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 px-6 py-10 text-center", className)}>
      <span className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300"><Plug className="size-5" aria-hidden /></span>
      <div className="max-w-md space-y-1">
        <p className="text-sm font-semibold">{`Connect ${names} first`}</p>
        <p className="text-xs text-muted-foreground">
          {missing.map((m) => (m.why ? `${m.name} is needed ${m.why}.` : `${m.name} is not connected.`)).join(" ")}{" "}
          {canManage ? "Connect it under Settings, then come back here." : "Ask someone who manages Settings to connect it."}
        </p>
      </div>
      {canManage && <Link href={settingsHref} className={buttonVariants({ size: "sm" })}>Open connected accounts</Link>}
    </div>
  );
}
