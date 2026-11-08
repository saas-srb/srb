import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import ConfirmDelete from "@/components/products/playbook-ai/ConfirmDelete";
import { PageHeader, SectionCard, EmptyState } from "@/components/products/rankmax-ai/SeoUi";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { schemasCol } from "@/lib/products/rankmax-ai/schema";
import { SCHEMA_LABEL } from "@/lib/products/rankmax-ai/schema-validate";
import { allPages } from "@/lib/products/rankmax-ai/pages";
import { deleteSchemaAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

const STATUS_CLASS = { published: "bg-emerald-500/15 text-emerald-700", draft: "bg-amber-500/15 text-amber-700", disabled: "bg-muted text-muted-foreground" } as const;

export default async function SchemaPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const [schemas, pages] = await Promise.all([(await schemasCol()).find({}).sort({ updatedAt: -1 }).toArray(), allPages()]);
  const crawled = pages.filter((p) => p.crawl && p.crawl.status === 200);
  const detected = new Map<string, { pages: number; invalid: number }>();
  let invalidBlocks = 0;
  for (const p of crawled) {
    const types = new Set(p.crawl!.jsonLd.flatMap((j) => j.types));
    for (const t of types) detected.set(t, { pages: (detected.get(t)?.pages ?? 0) + 1, invalid: detected.get(t)?.invalid ?? 0 });
    invalidBlocks += p.crawl!.jsonLd.filter((j) => !j.valid).length;
  }
  const without = crawled.filter((p) => p.crawl!.indexable && p.crawl!.jsonLd.length === 0);
  const idByPath = new Map(pages.map((p) => [p.path, p._id]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Schema / Structured Data"
        crumbs={[{ label: "Schema" }]}
        description="Create, validate and publish JSON-LD (Organization, LocalBusiness, Website, WebPage, Article, BlogPosting, Breadcrumb, FAQ, Product, Service, Event, JobPosting, Course, Review) and see what the site already emits."
        actions={can(viewer, "MANAGE_SCHEMA") && <Link href="/rankmax-ai/schema/new" className={buttonVariants({ size: "sm" })}><Plus className="size-3.5" data-icon="inline-start" />New schema</Link>}
      />
      <PanelListFilters>
<SectionCard title={`Managed schema (${schemas.length})`} description="JSON-LD maintained in this product. Published items are live on their target page(s).">
        {schemas.length === 0 ? <EmptyState title="No managed schema yet">Start from a template for any of the 14 supported types.</EmptyState> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Applies to</TableHead><TableHead>Status</TableHead><TableHead>Validation</TableHead><TableHead>Updated</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {schemas.map((s) => (
                <TableRow key={s._id}>
                  <TableCell><Link href={`/rankmax-ai/schema/${s._id}`} className="font-medium hover:underline">{s.name}</Link></TableCell>
                  <TableCell>{SCHEMA_LABEL[s.type]}</TableCell>
                  <TableCell className="text-xs">{s.path === "*" ? "Every public page" : s.path}</TableCell>
                  <TableCell><Badge className={STATUS_CLASS[s.status]}>{s.status}</Badge></TableCell>
                  <TableCell className="text-xs">{s.validation.errors.length ? <span className="text-rose-600">{s.validation.errors.length} error(s)</span> : <span className="text-emerald-600">Valid</span>}{s.validation.warnings.length > 0 && <span className="text-amber-600"> · {s.validation.warnings.length} warning(s)</span>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(s.updatedAt)}</TableCell>
                  <TableCell>{can(viewer, "DELETE") && <ConfirmDelete label="Delete schema" what={`schema “${s.name}”${s.status === "published" ? " (removes it from the live site)" : ""}`} action={async () => { "use server"; return deleteSchemaAction(s._id); }} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Detected on the site" description={`JSON-LD types found by the latest audit across ${crawled.length} pages${invalidBlocks ? ` · ${invalidBlocks} invalid block(s)` : ""}`}>
          {detected.size === 0 ? <EmptyState title="No crawl data" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Pages</TableHead></TableRow></TableHeader>
              <TableBody>{Array.from(detected.entries()).sort((a, b) => b[1].pages - a[1].pages).map(([t, d]) => <TableRow key={t}><TableCell>{t}</TableCell><TableCell className="text-right tabular-nums">{d.pages}</TableCell></TableRow>)}</TableBody>
            </Table>
          )}
          {invalidBlocks > 0 && <Link href="/rankmax-ai/issues?status=active&checkId=structured_data_invalid" className="mt-2 inline-block text-xs text-rose-600 hover:underline">See invalid structured data issues</Link>}
        </SectionCard>
        <SectionCard title={`Indexable pages without structured data (${without.length})`}>
          {without.length === 0 ? <EmptyState title="Every indexable page has JSON-LD" /> : (
            <ul className="max-h-96 divide-y divide-border/40 overflow-auto text-sm">
              {without.map((p) => <li key={p._id} className="py-1.5"><Link href={`/rankmax-ai/pages/${idByPath.get(p.path)}`} className="hover:underline">{p.path}</Link></li>)}
            </ul>
          )}
        </SectionCard>
      </div>
</PanelListFilters>
    </div>
  );
}
