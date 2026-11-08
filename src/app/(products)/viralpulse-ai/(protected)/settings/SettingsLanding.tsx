import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { Check, TriangleAlert, Plug, Palette, Cpu, Gauge, Users, ScrollText, Bell, HeartPulse, ChevronRight, Send } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { PageHeader, SectionCard } from "@/components/products/viralpulse-ai/SmmsUi";
import { getViralPulseHealth } from "@/lib/products/viralpulse-ai/health";
import { originFromHeaders } from "@/lib/products/viralpulse-ai/oauth-redirect";
import { visibleSettingsSections, type SmmsNavFlags } from "@/lib/products/viralpulse-ai/nav";

const ICONS: Record<string, React.ReactNode> = {
  accounts: <Plug className="size-5" />,
  publishing: <Send className="size-5" />,
  brand: <Palette className="size-5" />,
  ai: <Cpu className="size-5" />,
  limits: <Gauge className="size-5" />,
  health: <HeartPulse className="size-5" />,
  team: <Users className="size-5" />,
  audit: <ScrollText className="size-5" />,
  notifications: <Bell className="size-5" />,
};

/** One reading of the product's health, fed by `getViralPulseHealth`. Streams in after the page, so the probes never block it. */
async function HealthSummary() {
  const health = await getViralPulseHealth(originFromHeaders(await headers()));
  const bad = health.groups.flatMap((g) => g.items.filter((i) => i.status === "attention").map((i) => ({ ...i, group: g.title })));
  return (
    <>
      <p className="flex items-center gap-2 text-sm font-medium">
        {health.status === "ok" ? <Check className="size-4 text-emerald-600" aria-hidden /> : <TriangleAlert className="size-4 text-rose-600" aria-hidden />}
        {health.status === "ok" ? "Everything ViralPulse depends on is working." : `${health.attentionCount} item${health.attentionCount === 1 ? "" : "s"} need attention.`}
      </p>
      {bad.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {bad.slice(0, 4).map((i) => (
            <li key={i.id}><span className="font-medium text-foreground">{i.label}</span>{`: ${i.detail}`}</li>
          ))}
          {bad.length > 4 && <li>{`and ${bad.length - 4} more`}</li>}
        </ul>
      )}
      <Link href="/viralpulse-ai/settings?tab=health" className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">Open the full check</Link>
    </>
  );
}

export default function SettingsLanding({ flags }: { flags: SmmsNavFlags }) {
  const sections = visibleSettingsSections(flags);
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" crumbs={[{ label: "Settings" }]} description="Connected accounts, brand kit, AI models, limits, team and system health for ViralPulse AI." />
      <SectionCard title="System health" description="Keys, AI models, connected logins and scheduled jobs.">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Checking…</p>}>
          <HealthSummary />
        </Suspense>
      </SectionCard>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <li key={s.key} className="flex">
            <Link href={s.href} className="group flex w-full rounded-2xl focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
              <GlassCard className="w-full">
                <CardContent className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{ICONS[s.key]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold group-hover:text-primary">{s.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{s.description}</span>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </CardContent>
              </GlassCard>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
