import { breadcrumbList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";
import { listIncidents } from "@/lib/platform/status/incidents";
import { INCIDENT_IMPACTS, INCIDENT_STATUSES, formatDuration, uptimePercent, type IncidentView } from "@/lib/platform/status/shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/status", title: "System Status", description: "Live status of SelfRun AI: the website and the database every workspace runs on, with any open incident notice.", keywords: ["SelfRun AI status", "software uptime status", "SaaS system status page"], tag: "Status" });

async function probe(): Promise<{ ok: boolean; ms: number }> {
  const t = Date.now();
  try {
    await (await getPlatformDb()).command({ ping: 1 });
    return { ok: true, ms: Date.now() - t };
  } catch {
    return { ok: false, ms: Date.now() - t };
  }
}

/** A live check made when the page is opened: the website answered (you are reading it) and the database replied. It is not a history. */
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function IncidentCard({ i }: { i: IncidentView }) {
  const impact = INCIDENT_IMPACTS.find((x) => x.key === i.impact)?.label ?? i.impact;
  return (
    <li className="rounded-2xl border border-border/60 bg-background p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">{i.title}</p>
        <p className="text-xs text-muted-foreground">{impact}{i.resolvedAt ? ` · lasted ${formatDuration(Date.parse(i.resolvedAt) - Date.parse(i.startedAt))}` : ""}</p>
      </div>
      {i.components.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Affected: {i.components.join(", ")}</p>}
      <ol className="mt-3 space-y-2 border-l-2 border-border pl-4 text-sm">
        {[...i.updates].reverse().map((u, k) => (
          <li key={k}><span className="font-semibold">{INCIDENT_STATUSES.find((s) => s.key === u.status)?.label}</span> <span className="text-xs text-muted-foreground">{time(u.at)} IST</span><br /><span className="text-muted-foreground">{u.message}</span></li>
        ))}
      </ol>
    </li>
  );
}

export default async function StatusPage() {
  const db = await probe();
  const incidents = await listIncidents(90).catch(() => [] as IncidentView[]);
  const open = incidents.filter((i) => i.status !== "resolved");
  const history = incidents.filter((i) => i.status === "resolved");
  const byDay = new Map<string, IncidentView[]>();
  for (const i of history) byDay.set(day(i.startedAt), [...(byDay.get(day(i.startedAt)) ?? []), i]);
  const up30 = uptimePercent(incidents, 30);
  const up90 = uptimePercent(incidents, 90);
  const checkedAt = new Date().toISOString();
  const rows = [
    { name: "Website and apps", ok: true, detail: "Responding" },
    { name: "Database", ok: db.ok, detail: db.ok ? `Responding in ${db.ms} ms` : "Not responding" },
  ];
  const all = rows.every((r) => r.ok) && !open.some((i) => i.impact === "outage" || i.impact === "major");
  return (
    <>
      <JsonLd data={[webPage({ type: "WebPage", path: "/status", name: "System status", description: "Live status of SelfRun AI: the website and the database every workspace runs on, with any open incident notice." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Status", path: "/status" }])]} />
      <PageHero eyebrow="Status" title={all ? (open.length ? "Operational, with an open notice" : "All systems operational") : "Some systems are having trouble"} lead={`A live check of the website and the database that every ${SAAS_BRAND.name} workspace runs on, made when you opened this page (${new Date(checkedAt).toUTCString()}).`} photo="office" shot="workspace" shotName="Workspace">
        <HeroCtas primary={{ label: "Contact us", href: "/contact" }} secondary={{ label: "Read the docs", href: "/docs" }} />
      </PageHero>
      <section className="sr-section">
        <div className="sr-container max-w-2xl">
          <ul className="divide-y divide-border/70 rounded-3xl border border-border/60 bg-background shadow-sm" aria-label="Live checks">
            {rows.map((r) => (
              <li key={r.name} className="flex items-center gap-4 p-5">
                {r.ok ? <CheckCircle2 className="h-6 w-6 flex-none text-emerald-500" /> : <XCircle className="h-6 w-6 flex-none text-rose-500" />}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{r.name}</p>
                  <p className="text-sm text-muted-foreground">{r.detail}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${r.ok ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>{r.ok ? "Operational" : "Down"}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[["Uptime, last 30 days", up30], ["Uptime, last 90 days", up90]].map(([l, v]) => (
              <div key={l as string} className="rounded-2xl border border-border/60 bg-background p-4"><p className="text-xs text-muted-foreground">{l as string}</p><p className="text-2xl font-black tabular-nums">{v as number}%</p></div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Worked out from the incidents recorded below (full outages and major problems). Our commitment is 99.9% a month.</p>

          {open.length > 0 && (
            <section className="mt-10" aria-label="Open incidents">
              <h2 className="mb-3 text-lg font-black">Open incidents</h2>
              <ul className="space-y-3">{open.map((i) => <IncidentCard key={i.id} i={i} />)}</ul>
            </section>
          )}

          <section className="mt-10" aria-label="Past incidents">
            <h2 className="mb-3 text-lg font-black">Past incidents · last 90 days</h2>
            {history.length === 0 ? (
              <p className="rounded-2xl border border-border/60 bg-muted/20 p-5 text-sm text-muted-foreground">No incidents recorded in the last 90 days.</p>
            ) : (
              <div className="space-y-6">
                {[...byDay.entries()].map(([d, list]) => (
                  <div key={d}><h3 className="mb-2 text-sm font-bold text-muted-foreground">{d}</h3><ul className="space-y-3">{list.map((i) => <IncidentCard key={i.id} i={i} />)}</ul></div>
                ))}
              </div>
            )}
          </section>

          <p className="mt-10 rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm"><b>Our commitment:</b> 99.9% monthly uptime on every paid plan, with service credits if we miss it. <Link href="/sla" className="font-bold text-primary">Read the Uptime SLA</Link>.</p>
          <p className="mt-4 text-sm text-muted-foreground">Seeing a problem that this page does not show? Open a support request from the Help &amp; Support product, or write to us through the contact page.</p>
        </div>
      </section>
    </>
  );
}
