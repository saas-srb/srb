import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { Settings, Layers, LayoutTemplate, Tags, GitBranch } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { lpmsCan } from "@/lib/lpms-roles";
import { listMakerTypes } from "@/lib/products/contractflow-ai/makers";
import { listTemplates } from "@/lib/products/contractflow-ai/templates";
import { listCategories } from "@/lib/products/contractflow-ai/categories";
import { listWorkflows } from "@/lib/products/contractflow-ai/workflows";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function LpmsSettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  if (!lpmsCan(ctx, "MANAGE_POLICIES")) redirect("/contractflow-ai");

  const [makerTypes, templates, categories, workflows] = await Promise.all([
    listMakerTypes(viewer),
    listTemplates({}, viewer),
    listCategories(viewer),
    listWorkflows(viewer),
  ]);

  const stats = [
    {
      label: "Maker Types",
      count: makerTypes.length,
      icon: Layers,
      href: "/contractflow-ai/makers",
      description: "Document type definitions with field schemas and numbering",
    },
    {
      label: "Templates",
      count: templates.length,
      icon: LayoutTemplate,
      href: "/contractflow-ai/templates",
      description: "Block-based document templates with variables and branding",
    },
    {
      label: "Categories",
      count: categories.length,
      icon: Tags,
      href: "/contractflow-ai/categories",
      description: "Document categories for organisation and discovery",
    },
    {
      label: "Workflows",
      count: workflows.length,
      icon: GitBranch,
      href: "/contractflow-ai/workflows",
      description: "Multi-step approval workflows with role-based routing",
    },
  ];

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "ContractFlow", href: "/contractflow-ai" }, { label: "Settings" }]}
        title={<>ContractFlow Settings</>}
        description={<>Configure your Legal &amp; Document Automation system.</>}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map(({ label, count, icon: Icon, href, description }) => (
          <GlassCard key={label} interactive>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <CardTitle className="text-sm font-bold">{label}</CardTitle>
                </div>
                <span className="text-2xl font-black text-foreground">{count}</span>
              </div>
              <CardDescription className="text-xs">{description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link href={href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Manage {label}
              </Link>
            </CardContent>
          </GlassCard>
        ))}
      </div>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Document Numbering</CardTitle>
          <CardDescription className="text-xs">
            Each maker type has its own numbering config. Manage it from the maker type editor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Format: <code className="rounded bg-muted px-1 py-0.5">[PREFIX]-[YEAR]-[SEQ]</code>{" "}
            e.g. <code className="rounded bg-muted px-1 py-0.5">NDA-2026-001</code>
          </p>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-sm font-bold">AI Generation</CardTitle>
          <CardDescription className="text-xs">
            AI-powered document generation uses your workspace AI quota.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            AI generation is available when the <code className="rounded bg-muted px-1 py-0.5">ai.ts</code>{" "}
            module is configured. Users with <strong>AI Generate</strong> permission can access it.
          </p>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Digital Signatures</CardTitle>
          <CardDescription className="text-xs">
            E-sign integration via the provider interface in <code>lpms/signatures.ts</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Connect an e-sign provider (e.g. DocuSign, SignNow, Legalesign) by implementing
            the <code className="rounded bg-muted px-1 py-0.5">ESignProvider</code> interface.
            No provider is hardcoded.
          </p>
        </CardContent>
      </GlassCard>
    </div>
  );
}
