import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, ChevronRight } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { lpmsCan } from "@/lib/lpms-roles";
import { listMakerTypes } from "@/lib/products/contractflow-ai/makers";
import { listTemplates } from "@/lib/products/contractflow-ai/templates";

export default async function NewDocumentPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  if (!lpmsCan(ctx, "CREATE")) redirect("/contractflow-ai/documents");

  const makerTypes = await listMakerTypes(viewer);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "ContractFlow", href: "/contractflow-ai" },
          { label: "Documents", href: "/contractflow-ai/documents" },
          { label: "New Document" },
        ]}
        title={<>New Document</>}
        description={<>Choose a document type to get started.</>}
      />

      {makerTypes.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileText className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No document types have been configured yet.
            </p>
            {lpmsCan(ctx, "MANAGE_MAKERS") && (
              <Link
                href="/contractflow-ai/makers"
                className="text-sm font-medium text-primary underline"
              >
                Configure Maker Types →
              </Link>
            )}
          </CardContent>
        </GlassCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {makerTypes.map((maker: any) => (
            <Link
              key={maker.id}
              href={`/contractflow-ai/new/${maker.id}`}
              className="group"
            >
              <GlassCard interactive>
                <CardContent className="flex items-center gap-4 py-4">
                  <div
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl text-xl"
                    style={{
                      background: maker.color
                        ? `${maker.color}20`
                        : "hsl(var(--primary)/0.1)",
                    }}
                  >
                    {maker.icon ?? "📄"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{maker.name}</p>
                    {maker.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {maker.description}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </CardContent>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
