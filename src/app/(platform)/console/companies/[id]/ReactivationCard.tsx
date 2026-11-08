import { FileText, ShieldCheck, TriangleAlert } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { formatDateTime } from "@/lib/utils";
import type { ReactivationRequest } from "@/lib/platform/reactivation";
import ReactivationDecision from "./ReactivationDecision";

const TONE = { pending: "default", approved: "secondary", rejected: "outline" } as const;

/** The company's reactivation requests: the open one with Approve / Reject, then the history. Only shown to people who may change company status. */
export default function ReactivationCard({ companyId, companyName, requests, canDecide }: { companyId: string; companyName: string; requests: ReactivationRequest[]; canDecide: boolean }) {
  if (requests.length === 0) return null;
  return (
    <GlassCard>
      <CardHeader>
        <CardTitle>Reactivation requests</CardTitle>
        <CardDescription>People at this company asking to be switched back on after a suspension. Approving reactivates the company.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.map((r) => (
          <div key={r._id} id={`reactivation-${r._id}`} className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={TONE[r.status]} className="capitalize">{r.status}</Badge>
                <span className="font-mono text-xs text-muted-foreground">RA-{r._id.slice(0, 8).toUpperCase()}</span>
              </div>
              <span className="text-xs text-muted-foreground">Sent {formatDateTime(r.createdAt)}</span>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Requested by</dt>
                <dd>{r.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {r.email}
                  {r.emailMatchesDirector ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><ShieldCheck className="size-3.5" />A Director of this company</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600"><TriangleAlert className="size-3.5" />Not a Director here: check the ID carefully</span>
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Description</dt>
                <dd className="whitespace-pre-wrap">{r.message}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Government ID</dt>
                <dd>
                  {canDecide ? (
                    <a href={`/api/platform/companies/${companyId}/reactivation/${r._id}/document`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                      <FileText className="size-4" />View {r.idFile.name} ({Math.max(1, Math.round(r.idFile.size / 1024))} KB)
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Hidden: needs the right to suspend / reactivate companies</span>
                  )}
                </dd>
              </div>
            </dl>
            {r.status === "pending" && canDecide && <ReactivationDecision requestId={r._id} companyName={companyName} />}
            {r.status !== "pending" && (
              <p className="text-sm text-muted-foreground">
                {r.status === "approved" ? "Approved" : "Rejected"} {r.decidedAt ? formatDateTime(r.decidedAt) : ""}
                {r.decisionReason ? <> · {r.decisionReason}</> : null}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </GlassCard>
  );
}
