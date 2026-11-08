import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, GripVertical, Type, List, Table2, Image, Signature } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { lpmsCan } from "@/lib/lpms-roles";
import { getTemplate } from "@/lib/products/contractflow-ai/templates";
import { TEMPLATE_BLOCK_TYPES } from "@/lib/products/contractflow-ai/constants";

const blockIcon: Record<string, React.ReactNode> = {
  paragraph: <Type className="size-3.5" />,
  heading: <Type className="size-3.5 font-bold" />,
  bullets: <List className="size-3.5" />,
  numbered: <List className="size-3.5" />,
  table: <Table2 className="size-3.5" />,
  image: <Image className="size-3.5" />,
  signature: <Signature className="size-3.5" />,
};

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  if (!lpmsCan(ctx, "MANAGE_TEMPLATES")) redirect("/contractflow-ai");

  const { id } = await params;
  const template = id === "new" ? null : await getTemplate(id, viewer);
  if (id !== "new" && !template) notFound();

  const blocks = (template as any)?.blocks ?? [];

  return (
    <div className="space-y-4">

      <PanelPageHeader
        title={<>{template ? `Template: ${(template as any).name ?? (template as any).title}` : "New Template"}</>}
        description={<>{template ? `Version ${(template as any).version ?? 1} · ` : ""}Arrange the blocks a document built from this template is made of.</>}
        actions={<button className={buttonVariants({ size: "sm" })}>Save Template</button>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Canvas */}
        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Document Canvas</CardTitle>
            <CardDescription className="text-xs">
              Blocks are rendered in order. Drag to reorder (coming soon).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {blocks.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No blocks yet. Add blocks from the product on the right.
                </p>
              </div>
            ) : (
              blocks.map((block: any, i: number) => (
                <div
                  key={block.id ?? i}
                  className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/30 p-3"
                >
                  <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {blockIcon[block.type] ?? <Type className="size-3.5" />}
                      <span className="text-xs font-medium text-muted-foreground capitalize">
                        {block.type}
                      </span>
                    </div>
                    {block.content && (
                      <p className="mt-1 line-clamp-2 text-sm text-foreground">{block.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </GlassCard>

        {/* Block palette */}
        <div className="space-y-3">
          <GlassCard interactive={false}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold">Add Block</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-1.5 pt-0">
              {TEMPLATE_BLOCK_TYPES.map((bt) => (
                <button
                  key={bt.value}
                  type="button"
                  title={bt.hint}
                  className="flex flex-col items-center gap-1 rounded-lg border border-border/40 px-2 py-2 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  <span className="text-base">{bt.icon}</span>
                  {bt.label}
                </button>
              ))}
            </CardContent>
          </GlassCard>

          <GlassCard interactive={false}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold">Template Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-xs text-muted-foreground">
              <p>Blocks: {blocks.length}</p>
              <p>Variables: {(template as any)?.variables?.length ?? 0}</p>
              <p>Version: {(template as any)?.version ?? 1}</p>
            </CardContent>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
