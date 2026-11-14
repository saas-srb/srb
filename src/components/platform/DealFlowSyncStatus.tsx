import Link from "next/link";
import { Plug, ArrowRight, CheckCircle2, CircleSlash } from "lucide-react";
import type { IntegrationConnectionStatus, IntegrationStatus } from "@/lib/dealflow-ai/types";

const SETTINGS_HREF = "/commandos/settings/integrations";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

function StatusPill({ connected, source }: { connected: boolean; source: IntegrationConnectionStatus["source"] }) {
  return connected ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
      <CheckCircle2 className="size-3" /> {source === "platform" ? "Connected (SRB keys)" : "Connected"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
      <CircleSlash className="size-3" /> Not connected
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right text-foreground">{children}</strong>
    </div>
  );
}

function Card({ title, subtitle, pill, children, footer }: { title: string; subtitle: string; pill: React.ReactNode; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div>
          <h4 className="text-base font-black text-foreground">{title}</h4>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {pill}
      </div>
      <div className="space-y-2.5 text-xs">{children}</div>
      <div className="pt-2">{footer}</div>
    </div>
  );
}

const linkClass = "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/40 py-2.5 text-xs font-bold text-foreground hover:bg-muted";

export default function DealFlowSyncStatus({ integrations }: { integrations: IntegrationStatus }) {
  const { meta, whatsapp } = integrations.connections;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-3xl border border-primary/20 bg-primary/5 p-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-white shadow-lg">
          <Plug className="size-6" />
        </span>
        <div>
          <h3 className="text-lg font-black text-foreground">Where your leads and applications come from</h3>
          <p className="text-xs text-muted-foreground">
            Connection status comes from your workspace integrations. Counts are taken from the leads and applications recorded in your workspace.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card
          title="Meta (Facebook & Instagram)"
          subtitle="Your Meta developer app"
          pill={<StatusPill connected={meta.connected} source={meta.source} />}
          footer={<Link href={SETTINGS_HREF} className={linkClass}>{meta.connected ? "Manage connection" : "Connect Meta"} <ArrowRight className="size-3.5" /></Link>}
        >
          <p className="rounded-2xl bg-muted/30 p-3 leading-relaxed text-muted-foreground">
            This connects your Meta app for the Social Media product. Automatic Lead Ads import is not available, so Meta leads are not pulled in here.
          </p>
        </Card>

        <Card
          title="Lead inbox"
          subtitle="Leads and applicants recorded in your workspace"
          pill={<span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">{integrations.leadSources.reduce((n, s) => n + s.count, 0)} total</span>}
          footer={<Link href="/dealflow-ai/leads" className={linkClass}>Open leads <ArrowRight className="size-3.5" /></Link>}
        >
          {integrations.leadSources.length === 0 ? (
            <p className="text-muted-foreground">No leads have been recorded yet.</p>
          ) : (
            integrations.leadSources.map((s) => <Row key={s.source} label={s.label}>{s.count}</Row>)
          )}
        </Card>

        <Card
          title="Website careers portal"
          subtitle="Applications from your public careers page"
          pill={<span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">Built in</span>}
          footer={<Link href="/dealflow-ai/careers" className={linkClass}>Open job applications <ArrowRight className="size-3.5" /></Link>}
        >
          <Row label="Careers page">
            <a href={integrations.website.portalUrl} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">{integrations.website.portalUrl}</a>
          </Row>
          <Row label="Open positions">{integrations.website.openJobPositions}</Row>
          <Row label="Applications received">{integrations.website.totalApplications}</Row>
          <Row label="Most recent application">{when(integrations.website.lastApplicationReceivedAt)}</Row>
        </Card>

        <Card
          title="WhatsApp"
          subtitle="Business messaging"
          pill={<StatusPill connected={whatsapp.connected} source={whatsapp.source} />}
          footer={
            whatsapp.connected ? (
              <Link href="/dealflow-ai/whatsapp" className={linkClass}>Open WhatsApp <ArrowRight className="size-3.5" /></Link>
            ) : (
              <Link href={SETTINGS_HREF} className={linkClass}>Connect WhatsApp <ArrowRight className="size-3.5" /></Link>
            )
          }
        >
          <Row label="Provider">{whatsapp.connected ? (whatsapp.key === "twilio" ? "Twilio" : "WhatsApp Business (Meta Cloud API)") : "None"}</Row>
        </Card>
      </div>
    </div>
  );
}
