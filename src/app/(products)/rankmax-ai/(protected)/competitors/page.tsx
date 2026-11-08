import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import { PageHeader, SectionCard, TrustBadge, EmptyState, fmtNum, Notice } from "@/components/products/rankmax-ai/SeoUi";
import { BarsChart } from "@/components/products/rankmax-ai/SeoCharts";
import { COMPETITOR_FIELDS, competitorInitial } from "@/components/products/rankmax-ai/competitor-fields";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { competitorsCol, compareCompetitor, ourVisibility } from "@/lib/products/rankmax-ai/competitors";
import { backlinkOverview } from "@/lib/products/rankmax-ai/backlinks";
import { allActiveKeywords } from "@/lib/products/rankmax-ai/keywords";
import { allPages } from "@/lib/products/rankmax-ai/pages";
import { saveCompetitorAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { getCompanyBrand } from "@/lib/platform/branding";

export default async function CompetitorsPage() {
  const brand = await getCompanyBrand();
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const [comps, ourVis, bl, keywords, pages] = await Promise.all([(await competitorsCol()).find({}).sort({ name: 1 }).toArray(), ourVisibility(), backlinkOverview(), allActiveKeywords(), allPages()]);
  const comparisons = await Promise.all(comps.map((c) => compareCompetitor(c._id)));
  const ourTop10 = keywords.filter((k) => k.currentPosition !== null && k.currentPosition <= 10).length;
  const ourRanking = keywords.filter((k) => k.currentPosition !== null).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Competitors"
        crumbs={[{ label: "Competitors" }]}
        description={<>Compare {brand.name} with competitor sites. Competitor figures are <TrustBadge trust="estimated" /> (entered or imported from SEO tools); our figures are <TrustBadge trust="verified" /> product data. Visibility is calculated the same way for everyone over our tracked keyword set.</>}
        actions={can(viewer, "MANAGE_COMPETITORS") && <EditDialog trigger={<Button size="sm"><Plus className="size-3.5" data-icon="inline-start" />Add competitor</Button>} title="Add a competitor" columns={2} fields={COMPETITOR_FIELDS} initial={competitorInitial(null)} onSubmit={async (v) => { "use server"; return saveCompetitorAction(null, v); }} />}
      />
      <PanelListFilters>
{comps.length === 0 ? (
        <SectionCard title="No competitors yet"><EmptyState title="Add the sites you compete with in search">Then import their keyword positions to find keyword and content gaps.</EmptyState></SectionCard>
      ) : (
        <>
          <SectionCard title="SEO visibility" description="Share of the achievable click-through across our tracked keywords (volume-weighted; CTR curve by position)">
            <BarsChart data={[{ key: "us", label: brand.name, value: ourVis ?? 0, color: "#6366f1" }, ...comparisons.filter((x) => x).map((x) => ({ key: x!.competitor._id, label: x!.competitor.name, value: x!.visibility ?? 0, color: x!.competitor.color, href: `/rankmax-ai/competitors/${x!.competitor._id}` }))]} suffix="%" max={100} />
            {ourVis === null && <Notice tone="info">Record keyword positions to compute visibility.</Notice>}
          </SectionCard>
          <SectionCard title="Side by side">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Site</TableHead><TableHead className="text-right">Visibility</TableHead><TableHead className="text-right">Organic keywords</TableHead><TableHead className="text-right">Top-10 keywords</TableHead><TableHead className="text-right">Organic traffic</TableHead><TableHead className="text-right">Backlinks</TableHead><TableHead className="text-right">Ref. domains</TableHead><TableHead className="text-right">Indexable pages</TableHead><TableHead className="text-right">Keyword gaps</TableHead><TableHead>Source</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-primary/5">
                    <TableCell className="font-semibold">{brand.name} (us)</TableCell>
                    <TableCell className="text-right tabular-nums">{ourVis !== null ? `${ourVis}%` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{ourRanking} tracked ranking</TableCell>
                    <TableCell className="text-right tabular-nums">{ourTop10}</TableCell>
                    <TableCell className="text-right text-muted-foreground">see Dashboard</TableCell>
                    <TableCell className="text-right tabular-nums">{bl.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{bl.referringDomains}</TableCell>
                    <TableCell className="text-right tabular-nums">{pages.filter((p) => p.crawl?.indexable).length}</TableCell>
                    <TableCell />
                    <TableCell><TrustBadge trust="verified" /></TableCell>
                  </TableRow>
                  {comparisons.map((x) =>
                    x ? (
                      <TableRow key={x.competitor._id}>
                        <TableCell><Link href={`/rankmax-ai/competitors/${x.competitor._id}`} className="flex items-center gap-2 font-medium hover:underline"><span className="size-2.5 rounded-full" style={{ background: x.competitor.color }} />{x.competitor.name}<span className="text-xs font-normal text-muted-foreground">{x.competitor.domain}</span></Link></TableCell>
                        <TableCell className="text-right tabular-nums">{x.visibility !== null ? `${x.visibility}%` : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(x.competitor.metrics.organicKeywords)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(x.competitor.metrics.rankingKeywords)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(x.competitor.metrics.organicTraffic)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(x.competitor.metrics.backlinks)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(x.competitor.metrics.referringDomains)}</TableCell>
                        <TableCell className="text-right tabular-nums">{x.competitor.sitemap ? <span title="From their public sitemap (measured)">{fmtNum(x.competitor.sitemap.urlCount)}</span> : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{x.gaps.length}</TableCell>
                        <TableCell className="text-xs"><TrustBadge trust="estimated" label={x.competitor.metrics.source || "Estimated"} /> {x.competitor.metrics.asOf}</TableCell>
                      </TableRow>
                    ) : null
                  )}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </>
      )}
</PanelListFilters>
    </div>
  );
}
