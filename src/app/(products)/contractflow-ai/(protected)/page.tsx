import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  FileText,
  CheckSquare,
  PencilLine,
  Bot,
  CalendarClock,
  ArrowRight,
  Clock,
  Layers,
} from 'lucide-react';
import { CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import GlassCard from '@/components/products/dealflow-ai/GlassCard';
import KpiGrid from '@/components/products/dealflow-ai/KpiGrid';
import Breadcrumbs from '@/components/products/dealflow-ai/Breadcrumbs';
import KpiLink from '@/components/products/playbook-ai/KpiLink';
import { BarsChart, DonutChart, TrendChart } from '@/components/products/playbook-ai/SopCharts';
import { getViewer } from '@/lib/products/contractflow-ai/viewer';
import { getLpmsDashboard } from '@/lib/products/contractflow-ai/analytics';
import { lpmsCan } from '@/lib/lpms-roles';

function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <GlassCard interactive={false} className={className}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-bold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </GlassCard>
  );
}

export default async function LpmsDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect('/contractflow-ai/login');

  const d = await getLpmsDashboard(viewer, { q: sp.q, from: sp.from, to: sp.to });
  const k = d.kpis;

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  const canApprove = lpmsCan(ctx, 'APPROVE');

  return (
    <div className="space-y-4">
      <PanelDashboardHeader
        filters={<PanelFilterBar
          presets
          fields={[
            { key: "q", label: "Search", type: "search", placeholder: "Search documents by title…" },
            { key: "from", label: "From", type: "date" },
            { key: "to", label: "To", type: "date" },
          ]}
        />}
        breadcrumbs={[{ label: 'ContractFlow', href: '/contractflow-ai' }, { label: 'Dashboard' }]}
        title="Legal Documents Overview"
        description="Documents are now written in Playbook AI. ContractFlow is being rebuilt for signing and a signed-document vault; the documents below come from the earlier version and are kept as they are."
      />

      {/* Pending approvals action banner */}
      {k.pendingApprovals > 0 && canApprove && (
        <Link
          href="/contractflow-ai/approvals"
          className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm transition-colors hover:bg-primary/10"
        >
          <CheckSquare className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-foreground">
              {k.pendingApprovals} document{k.pendingApprovals === 1 ? '' : 's'} waiting for your approval
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {/* KPI tiles */}
      <KpiGrid>
        <KpiLink
          href="/contractflow-ai/documents"
          label="Total Documents"
          value={k.totalDocuments}
          accent
          icon={<FileText className="size-4" />}
        />
        <KpiLink
          href="/contractflow-ai/documents?status=active"
          label="Active Documents"
          value={k.activeDocuments}
          icon={<CheckSquare className="size-4" />}
        />
        <KpiLink
          href="/contractflow-ai/documents?status=draft"
          label="Draft Documents"
          value={k.draftDocuments}
          icon={<PencilLine className="size-4" />}
        />
        <KpiLink
          href="/contractflow-ai/approvals"
          label="Pending Approvals"
          value={k.pendingApprovals}
          tone={k.pendingApprovals > 0 ? 'down' : undefined}
          icon={<Clock className="size-4" />}
        />
        <KpiLink
          href="/contractflow-ai/documents?filter=ai"
          label="AI Generated"
          value={k.aiGenerated}
          icon={<Bot className="size-4" />}
        />
        <KpiLink
          href="/contractflow-ai/documents?attention=expiring"
          label="Expiring Documents"
          value={k.expiringDocuments}
          tone={k.expiringDocuments > 0 ? 'down' : undefined}
          icon={<CalendarClock className="size-4" />}
        />
      </KpiGrid>

      {/* Charts grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Documents by Status" description="Draft → Review → Approved → Active → Archived">
          <DonutChart data={d.byStatus} emptyLabel="No documents yet." />
        </ChartCard>

        <ChartCard title="Documents by Maker Type" description="Click a bar to filter the document list">
          <BarsChart data={d.byMakerType} emptyLabel="No documents yet." />
        </ChartCard>

        <ChartCard title="Documents by Category">
          <BarsChart data={d.byCategory} emptyLabel="No categories configured yet." />
        </ChartCard>

        <ChartCard title="Document Creation Trend" description="New documents per month, last 12 months">
          <TrendChart
            data={d.creationTrend}
            id="lpms-create"
          />
        </ChartCard>
      </div>

      {/* Recent Documents table */}
      {d.recentDocuments.length > 0 && (
        <GlassCard interactive={false}>
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold">Recent Documents</CardTitle>
              <Link
                href="/contractflow-ai/documents"
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                View all
                <ArrowRight className="size-3" />
              </Link>
            </div>
            <CardDescription className="text-xs">Last 5 created or updated documents</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/40 text-sm">
              {d.recentDocuments.map((doc) => (
                <li key={doc.id}>
                  <Link
                    href={`/contractflow-ai/documents/${doc.id}`}
                    className="flex items-center justify-between gap-3 py-2 hover:text-primary"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <Layers className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate font-medium">{doc.title || 'Untitled Document'}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {doc.documentNumber && (
                        <span className="text-xs text-muted-foreground">{doc.documentNumber}</span>
                      )}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                        {doc.status}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </GlassCard>
      )}
    </div>
  );
}
