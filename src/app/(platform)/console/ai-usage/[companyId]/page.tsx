import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { aiUsageHistory } from "@/lib/platform/billing/ai-usage-log";

export const metadata: Metadata = { title: "AI token history" };

const num = (n: number) => new Intl.NumberFormat("en-IN").format(n);

export default async function PlatformCompanyAiUsagePage({ params }: { params: Promise<{ companyId: string }> }) {
  await requirePlatformPermission("usage.read");
  const { companyId } = await params;
  const { name, events } = await aiUsageHistory(decodeURIComponent(companyId));
  const total = events.reduce((s, e) => s + e.totalTokens, 0);
  return (
    <div className="space-y-6 p-1">
      <Link href="/console/ai-usage" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All companies</Link>
      <PlatformPageHeader title={`${name} — AI token history`} description={`Latest ${events.length} AI calls (${num(total)} tokens), newest first.`} />
      <GlassCard>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Feature</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Call</TableHead>
                <TableHead className="text-right">Input</TableHead>
                <TableHead className="text-right">Output</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No AI usage recorded for this company.</TableCell>
                </TableRow>
              )}
              {events.map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap">{new Date(e.at).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{e.feature}</TableCell>
                  <TableCell>{e.model || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{e.endpoint || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(e.inputTokens)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(e.outputTokens)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{num(e.totalTokens)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}
