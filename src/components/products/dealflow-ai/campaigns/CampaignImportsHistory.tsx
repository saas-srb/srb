import { FileSpreadsheet, Users } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import UndoImportButton from "@/components/products/dealflow-ai/campaigns/UndoImportButton";
import { getPlatformMeta } from "@/lib/campaign-platforms";
import { formatDateTime } from "@/lib/utils";
import type { CampaignImportSummary } from "@/lib/campaigns";

const STATUS_LABEL: Record<CampaignImportSummary["status"], string> = {
  completed: "Completed",
  completed_with_errors: "Completed with errors",
  failed: "Failed",
  reverted: "Undone",
};

export default function CampaignImportsHistory({ imports }: { imports: CampaignImportSummary[] }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle>Recent Imports</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {imports.length === 0 && <p className="text-sm text-muted-foreground">No imports yet.</p>}
        {imports.map((imp) => (
          <div key={imp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3 text-sm">
            <div className="flex min-w-0 items-center gap-3">
              {imp.kind === "performance" ? (
                <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Users className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {getPlatformMeta(imp.platform).shortLabel} · {imp.kind === "performance" ? "Performance" : "Lead list"}
                  <span className="ml-2 font-normal text-muted-foreground">{imp.filename}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(imp.createdAt)} · {STATUS_LABEL[imp.status]}
                  {imp.kind === "performance"
                    ? ` · ${imp.rowsImported} new, ${imp.rowsUpdated} updated`
                    : ` · ${imp.leadsMatched ?? 0} matched, ${imp.leadsUnmatched ?? 0} unmatched`}
                  {imp.rowsError > 0 ? ` · ${imp.rowsError} errors` : ""}
                </p>
              </div>
            </div>
            {imp.undoable && (
              <UndoImportButton
                importId={imp.id}
                label={imp.kind === "performance" ? "Removes the rows this file added and reverts rows it changed." : "Reverts the campaign/source stamped on the matched leads."}
              />
            )}
          </div>
        ))}
      </CardContent>
    </GlassCard>
  );
}
