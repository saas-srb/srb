import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  FileText, Clock, CheckCircle, Archive, AlertCircle,
  Download, Send, CheckSquare, XCircle, Pencil, Trash2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { lpmsCan } from "@/lib/lpms-roles";
import { getDocument } from "@/lib/products/contractflow-ai/documents";
import { LPMS_STATUSES } from "@/lib/products/contractflow-ai/constants";

export default async function LpmsDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");

  const { id } = await params;
  const doc = await getDocument(id, viewer);
  if (!doc) notFound();

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  const canEdit = lpmsCan(ctx, "EDIT") && (doc.status === "draft" || doc.status === "review");
  const canSubmit = lpmsCan(ctx, "EDIT") && doc.status === "draft";
  const canApprove = lpmsCan(ctx, "APPROVE") && doc.status === "pending_approval";
  const canPublish = lpmsCan(ctx, "PUBLISH") && doc.status === "approved";
  const canArchive = lpmsCan(ctx, "ARCHIVE") && (doc.status === "active" || doc.status === "published");
  const canDownload = lpmsCan(ctx, "DOWNLOAD");
  const canDelete = lpmsCan(ctx, "DELETE") && doc.status === "draft";

  const statusMeta = LPMS_STATUSES.find((s) => s.value === (doc as any).status);

  return (
    <div className="space-y-4">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PanelPageHeader
            title={<>{(doc as any).title}</>}
          />
          <div className="mt-1 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{(doc as any).documentNumber}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                statusMeta?.badgeClass ?? "bg-muted text-muted-foreground"
              }`}
            >
              <span className={`size-1.5 rounded-full ${statusMeta?.dotClass ?? "bg-muted-foreground"}`} />
              {statusMeta?.label ?? (doc as any).status}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canDownload && (
            <a
              href={`/api/contractflow-ai/files/${id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download className="size-3.5" />
              Download
            </a>
          )}
          {canEdit && (
            <Link href={`/contractflow-ai/documents/${id}/edit`} className={buttonVariants({ size: "sm" })}>
              <Pencil className="size-3.5" />
              Edit
            </Link>
          )}
        </div>
      </div>

      {/* Status actions banner */}
      {(canSubmit || canApprove || canPublish || canArchive || canDelete) && (
        <GlassCard interactive={false}>
          <CardContent className="flex flex-wrap items-center gap-2 py-3">
            <p className="text-sm font-medium text-foreground">Actions:</p>
            {canSubmit && (
              <form action={`/contractflow-ai/documents/${id}/submit`} method="post">
                <button
                  type="submit"
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  <Send className="size-3.5" />
                  Submit for Approval
                </button>
              </form>
            )}
            {canApprove && (
              <Link href={`/contractflow-ai/approvals?doc=${id}`} className={buttonVariants({ size: "sm" })}>
                <CheckSquare className="size-3.5" />
                Review &amp; Approve
              </Link>
            )}
            {canPublish && (
              <form action={`/contractflow-ai/documents/${id}/publish`} method="post">
                <button type="submit" className={buttonVariants({ size: "sm" })}>
                  <CheckCircle className="size-3.5" />
                  Publish
                </button>
              </form>
            )}
            {canArchive && (
              <form action={`/contractflow-ai/documents/${id}/archive`} method="post">
                <button
                  type="submit"
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  <Archive className="size-3.5" />
                  Archive
                </button>
              </form>
            )}
          </CardContent>
        </GlassCard>
      )}

      {/* Document content */}
      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Document Content</CardTitle>
          <CardDescription className="text-xs">
            Created {new Date((doc as any).createdAt).toLocaleDateString()} by{" "}
            {(doc as any).createdBy}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {((doc as any).blocks ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              This document has no content blocks yet.
              {canEdit && (
                <>
                  {" "}
                  <Link href={`/contractflow-ai/documents/${id}/edit`} className="text-primary underline">
                    Start editing
                  </Link>
                  .
                </>
              )}
            </p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {((doc as any).blocks ?? []).map((block: any, i: number) => {
                if (block.type === "paragraph") return <p key={i}>{block.content}</p>;
                if (block.type === "heading")
                  return (
                    <div key={i}>
                      {block.level === 1 && <h1>{block.content}</h1>}
                      {block.level === 2 && <h2>{block.content}</h2>}
                      {block.level === 3 && <h3>{block.content}</h3>}
                      {block.level === 4 && <h4>{block.content}</h4>}
                    </div>
                  );
                if (block.type === "bullets")
                  return (
                    <ul key={i}>
                      {(block.items ?? []).map((item: string, j: number) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                  );
                if (block.type === "divider") return <hr key={i} />;
                if (block.type === "note")
                  return (
                    <div key={i} className="rounded-lg bg-muted/60 p-3 text-sm">
                      {block.content}
                    </div>
                  );
                return (
                  <div key={i} className="rounded border border-border/40 p-2 text-xs text-muted-foreground">
                    [{block.type}]
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </GlassCard>

      {/* Field values */}
      {Object.keys((doc as any).fieldValues ?? {}).length > 0 && (
        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Field Values</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 sm:grid-cols-2">
              {Object.entries((doc as any).fieldValues ?? {}).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-medium text-muted-foreground capitalize">
                    {k.replace(/_/g, " ")}
                  </dt>
                  <dd className="text-sm text-foreground">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </GlassCard>
      )}
    </div>
  );
}
