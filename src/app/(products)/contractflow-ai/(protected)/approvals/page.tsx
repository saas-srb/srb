import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckSquare, XCircle, Clock } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardContent } from "@/components/ui/card";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { lpmsCan } from "@/lib/lpms-roles";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { approveDocumentAction, rejectDocumentAction } from "@/app/(products)/contractflow-ai/(protected)/actions";

export default async function ApprovalsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  if (!lpmsCan(ctx, "APPROVE")) redirect("/contractflow-ai");

  const companyId = await currentCompanyId();
  const db = await getDb();
  const approvals = await db
    .collection("lpms_approvals")
    .find({ companyId, status: "pending" })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  const allDocs = approvals.length
    ? await db
        .collection("lpms_documents")
        .find({ companyId })
        .toArray()
    : [];
  const docMap = Object.fromEntries(allDocs.map((d: any) => [d._id.toString(), d]));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "ContractFlow", href: "/contractflow-ai" }, { label: "Approvals" }]}
        title={<>Approval Queue</>}
        description={<>{approvals.length} pending approval{approvals.length !== 1 ? "s" : ""}</>}
      />

      <PanelListFilters>
{approvals.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <CheckSquare className="size-10 text-emerald-500/40" />
            <p className="text-sm text-muted-foreground">All caught up! No pending approvals.</p>
          </CardContent>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval: any) => {
            const doc = docMap[approval.documentId];
            return (
              <GlassCard key={approval._id.toString()} interactive={false}>
                <CardContent className="flex items-start gap-4 py-4">
                  <Clock className="mt-0.5 size-5 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/contractflow-ai/documents/${approval.documentId}`}
                      className="font-semibold text-foreground hover:text-primary"
                    >
                      {doc?.title ?? "Unknown Document"}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {doc?.documentNumber} · Submitted{" "}
                      {new Date(approval.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form
                      action={async () => {
                        "use server";
                        await approveDocumentAction(
                          approval.documentId,
                          approval._id.toString(),
                          ""
                        );
                      }}
                    >
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/20"
                      >
                        <CheckSquare className="size-3.5" />
                        Approve
                      </button>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await rejectDocumentAction(
                          approval.documentId,
                          approval._id.toString(),
                          ""
                        );
                      }}
                    >
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20"
                      >
                        <XCircle className="size-3.5" />
                        Reject
                      </button>
                    </form>
                  </div>
                </CardContent>
              </GlassCard>
            );
          })}
        </div>
      )}
</PanelListFilters>
    </div>
  );
}
