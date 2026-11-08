import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Gauge, Sparkles, Zap } from "lucide-react";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { aiUsageByCompany, aiUsageTotals } from "@/lib/platform/billing/ai-usage-log";

export const metadata: Metadata = { title: "AI token history" };

const num = (n: number) => new Intl.NumberFormat("en-IN").format(n);

export default async function PlatformAiUsagePage() {
  await requirePlatformPermission("usage.read");
  const [rows, totals] = await Promise.all([aiUsageByCompany(), aiUsageTotals()]);
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="AI token history" description="Every AI call made for each company — website generation, the CMS assistant and other AI features — with the tokens it used. Open a company to see its full history." />
      <KpiGrid cols={4}>
        <KpiCard label="Companies using AI" value={rows.length} icon={<Building2 className="size-4" />} />
        <KpiCard label="AI calls (all time)" value={totals.calls} icon={<Zap className="size-4" />} />
        <KpiCard label="Tokens (all time)" value={totals.totalTokens} icon={<Sparkles className="size-4" />} />
        <KpiCard label="Tokens this month" value={totals.monthTokens} icon={<Gauge className="size-4" />} />
      </KpiGrid>
      <GlassCard>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Input tokens</TableHead>
                <TableHead className="text-right">Output tokens</TableHead>
                <TableHead className="text-right">Total tokens</TableHead>
                <TableHead>Last used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No AI usage has been recorded yet.</TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.companyId}>
                  <TableCell><Link href={`/console/ai-usage/${encodeURIComponent(r.companyId)}`} className="font-medium text-primary hover:underline">{r.name}</Link></TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.calls)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.inputTokens)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.outputTokens)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{num(r.totalTokens)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{r.lastAt ? new Date(r.lastAt).toLocaleString("en-IN") : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}
