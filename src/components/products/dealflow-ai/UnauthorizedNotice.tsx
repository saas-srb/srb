import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

/**
 * Rendered inline (not via `redirect()`) by a page whose capability check
 * fails, so the user sees why instead of silently bouncing to their
 * dashboard. Use where a page's own predicate check fails — server actions
 * and API routes should keep throwing/returning JSON errors instead.
 */
export default function UnauthorizedNotice({
  backHref,
  backLabel = "Back to Dashboard",
  message = "You don't have permission to view this page.",
}: {
  backHref: string;
  backLabel?: string;
  message?: string;
}) {
  return (
    <GlassCard interactive={false}>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="size-6" />
        </span>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link href={backHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {backLabel}
        </Link>
      </CardContent>
    </GlassCard>
  );
}
