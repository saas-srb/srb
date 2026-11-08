import { CheckCircle2, CircleDashed, PenLine, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ContentStatus = "published" | "draft" | "archived";

/**
 * The CMS's one status vocabulary, used on every list, editor and dashboard:
 * Published (live), Draft (never published), Archived (hidden), plus an
 * "Unpublished changes" badge when a live item has pending edits.
 */
export function ContentStatusBadge({ status, version, className }: { status: ContentStatus; version?: string | null; className?: string }) {
  if (status === "published") {
    return (
      <Badge variant="outline" className={cn("gap-1 border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400", className)}>
        <CheckCircle2 className="size-3" /> Published{version ? ` · v${version}` : ""}
      </Badge>
    );
  }
  if (status === "archived") {
    return (
      <Badge variant="outline" className={cn("gap-1 text-muted-foreground", className)}>
        <Archive className="size-3" /> Archived
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn("gap-1 border-sky-500/30 bg-sky-500/5 text-sky-600 dark:text-sky-400", className)}>
      <CircleDashed className="size-3" /> Draft
    </Badge>
  );
}

export function PendingChangesBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1 border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400", className)}>
      <PenLine className="size-3" /> Unpublished changes
    </Badge>
  );
}
