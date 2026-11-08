import { AlertTriangle, CheckCircle2, Clock, ShieldOff, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/products/viralpulse-ai/accounts/status";
import type { AccountStatus } from "@/lib/products/viralpulse-ai/accounts/types";

const STYLE: Record<AccountStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
  healthy: { cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: CheckCircle2 },
  expiring: { cls: "bg-amber-500/15 text-amber-800 dark:text-amber-300", Icon: Clock },
  expired: { cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300", Icon: XCircle },
  revoked: { cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300", Icon: ShieldOff },
  missing_scope: { cls: "bg-amber-500/15 text-amber-800 dark:text-amber-300", Icon: AlertTriangle },
};

/** The account's real status. Icon and words, never colour alone. */
export default function StatusBadge({ status, className }: { status: AccountStatus; className?: string }) {
  const { cls, Icon } = STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", cls, className)}>
      <Icon className="size-3" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
