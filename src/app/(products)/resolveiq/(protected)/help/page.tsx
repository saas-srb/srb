import Link from "next/link";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { listPublished, searchArticles } from "@/lib/support/articles";

export const dynamic = "force-dynamic";

export default async function HelpCenterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const articles = q ? await searchArticles(q, { limit: 50 }) : await listPublished(200);
  const groups = new Map<string, typeof articles>();
  for (const a of articles) groups.set(a.category, [...(groups.get(a.category) ?? []), a]);

  return (
    <div className="space-y-4">
      <PanelDashboardHeader
        title="Help Center"
        description="Guides, FAQs and troubleshooting for your workspace. Search for a topic, or ask the assistant for a direct answer."
        filters={<PanelFilterBar title="Search the Help Center" description="Find a guide by topic, feature or error" fields={[{ key: "q", label: "Search", type: "search", placeholder: "e.g. create a project, invoice, add employee…" }]} />}
      />
      {articles.length === 0 ? (
        <GlassCard interactive={false} className="p-8 text-center text-sm text-muted-foreground">
          {q ? <>No guides match “{q}”. Try the Help Assistant, or <Link href="/resolveiq/requests/new" className="text-primary hover:underline">send a request</Link>.</> : "No guides have been published yet."}
        </GlassCard>
      ) : (
        [...groups.entries()].map(([category, list]) => (
          <section key={category} className="space-y-2">
            <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((a) => (
                <Link key={a.slug} href={`/resolveiq/help/${a.slug}`} className="block">
                  <GlassCard className="p-4">
                    <p className="text-sm font-semibold text-foreground">{a.title}</p>
                    {a.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.summary}</p>}
                  </GlassCard>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
