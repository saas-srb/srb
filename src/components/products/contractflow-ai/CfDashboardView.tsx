import Link from "next/link";
import { AlertTriangle, BadgeCheck, Ban, CheckCircle2, Clock, Eye, FileText, FileClock, Percent, Send, ShieldAlert, Signature, Bell } from "lucide-react";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import KpiLink from "@/components/products/playbook-ai/KpiLink";
import ExecutiveSection from "@/components/products/commandos/ExecutiveSection";
import { Donut, Histogram, StackedBars, TrendLine } from "@/components/dashboard-kit/Charts";
import { AttentionCard, BarList, DASH_RANGE_CHIPS, Funnel, Section, SectionDivider } from "@/components/dashboard-kit/Blocks";
import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import { CF_CHANNEL_OPTIONS, CF_RECIPIENT_OPTIONS, CF_STATUS_OPTIONS, CF_TYPE_OPTIONS } from "@/lib/products/contractflow-ai/dashboard/filters";
import { buttonVariants } from "@/components/ui/button";
import { nf } from "@/lib/products/playbook-ai/dashboard/format";
import type { CfDashboardData, Tile } from "@/lib/products/contractflow-ai/dashboard/types";

const ICON: Record<string, React.ReactNode> = {
  documents: <FileText className="size-4" />, drafts: <FileClock className="size-4" />, out: <Send className="size-4" />, viewed: <Eye className="size-4" />, signed: <CheckCircle2 className="size-4" />,
  lost: <Ban className="size-4" />, turnaround: <Clock className="size-4" />, completion: <Percent className="size-4" />, otp: <ShieldAlert className="size-4" />, reminders: <Bell className="size-4" />,
};

function StatTile({ t }: { t: Tile }) {
  const value = t.value === null ? <span className="text-muted-foreground">No data</span> : t.format === "days" ? <span>{nf.format(t.value)} d</span> : t.format === "pct" ? <span>{nf.format(t.value)}%</span> : t.value;
  return <KpiLink href={t.href} label={t.key === "documents" ? `${t.label} · ${t.note}` : t.label} value={value} icon={ICON[t.key]} trend={t.deltaPct} trendInvert={t.good === "down"} tone={t.key === "completion" && t.value !== null ? (t.value >= 70 ? "up" : t.value < 40 ? "down" : undefined) : undefined} />;
}

/** The ContractFlow home: figures, charts and the lists that need attention, for a date range. Built from the shared dashboard kit. */
export default function CfDashboardView({ data, rangeHrefBase = "/contractflow-ai/dashboard", custom, canSettings = false }: { data: CfDashboardData; rangeHrefBase?: string; custom?: { from: string; to: string }; canSettings?: boolean }) {
  const r = data.range;
  const a = data.attention;
  return (
    <div className="min-w-0 space-y-4">
      <PanelDashboardHeader
        breadcrumbs={[{ label: "ContractFlow", href: "/contractflow-ai" }, { label: "Dashboard" }]}
        title="Dashboard"
        description={<>Documents sent for signature and where each one stands. <strong className="font-semibold text-foreground">{r.label}</strong>, compared with the {r.days} days before. {data.scope === "all" ? "Showing the whole company." : "Showing your own documents only."}</>}
        actions={<Link href="/contractflow-ai/documents" className={buttonVariants({ size: "sm", variant: "outline" })}>All documents</Link>}
        filters={
          <PanelFilterBar
            description="Search and segment your documents sent for signature"
            ranges={DASH_RANGE_CHIPS}
            fields={[
              { key: "q", label: "Search", type: "search", placeholder: "Title or recipient" },
              { key: "type", label: "Type", type: "select", options: CF_TYPE_OPTIONS, allLabel: "All" },
              { key: "recipient", label: "Recipient type", type: "select", options: CF_RECIPIENT_OPTIONS, allLabel: "All" },
              { key: "status", label: "Status", type: "select", options: CF_STATUS_OPTIONS, allLabel: "All" },
              { key: "sender", label: "Sent by", type: "select", options: data.options.senders.map((s) => ({ value: s.id, label: s.name })), allLabel: "Everyone" },
              { key: "channel", label: "Signer channel", type: "select", options: CF_CHANNEL_OPTIONS, allLabel: "All" },
            ]}
          />
        }
      />

      {data.noMatch && (
        <Section title="No match">
          <p className="text-sm text-muted-foreground">Nothing matches these filters in this period. Change the range or use Clear filters.</p>
        </Section>
      )}

      {data.empty && !data.noMatch && (
        <Section title="Nothing here yet">
          <p className="text-sm text-muted-foreground">Documents appear here when Playbook copies them to ContractFlow. Open My Documents in Playbook, choose a draft and use Send to ContractFlow. The figures and charts fill in as documents are sent and signed.</p>
          <Link href="/playbook-ai/documents" className={`${buttonVariants({ size: "sm" })} mt-3`}>Open Playbook documents</Link>
        </Section>
      )}

      <ExecutiveSection title="Key figures" description={`${r.label}, with the change against the ${r.days} days before.`}>
        <KpiGrid>{data.tiles.map((t) => <StatTile key={t.key} t={t} />)}</KpiGrid>
      </ExecutiveSection>

      <SectionDivider label="Trends and breakdowns" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Sent and signed over time" description={`Requests sent and completed per ${data.over.granularity}`} className="lg:col-span-2">
          <StackedBars points={data.over.points} series={[{ key: "sent", name: "Sent", color: "#6366f1" }, { key: "signed", name: "Signed", color: "#10b981" }]} label="Sent and signed over time" noun="requests" emptyText="Nothing was sent or signed in this period." />
        </Section>
        <Section title="Signing funnel" description="How far the documents created in this period got">
          <Funnel steps={data.funnel} emptyText="Nothing was created in this period, so there is no funnel yet." />
        </Section>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Time to sign" description={data.turnaround.count ? `${data.turnaround.count} signed · average ${data.turnaround.avgDays} d · median ${data.turnaround.medianDays} d` : "From sending to the last signature"}><Histogram data={data.turnaround.buckets} label="Signing turnaround" emptyText="Nothing was signed in this period." /></Section>
        <Section title="Turnaround trend" description="Average days from sent to signed"><TrendLine data={data.turnaround.trend} unit="days" label="Average time to sign" emptyText="Nothing was signed in this period." /></Section>
        <Section title="Outcomes without a signature" description="Closed in this period">
          <dl className="grid grid-cols-3 gap-2 text-center text-sm">
            <div><dt className="text-xs text-muted-foreground">Rejected</dt><dd className="text-xl font-black tabular-nums">{nf.format(data.outcomes.declined)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Expired</dt><dd className="text-xl font-black tabular-nums">{nf.format(data.outcomes.expired)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Voided</dt><dd className="text-xl font-black tabular-nums">{nf.format(data.outcomes.voided)}</dd></div>
          </dl>
          <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rejection reasons</h4>
          <BarList items={data.outcomes.reasons} empty="No rejection reasons recorded." />
        </Section>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Section title="By document type" description="Top 10 sent in this period" className="lg:col-span-2"><BarList items={data.byType} empty="Nothing was sent in this period." /></Section>
        <Section title="By recipient" description="Who it was sent to"><Donut data={data.byRecipient} label="Requests by recipient type" emptyText="Nothing was sent in this period." /></Section>
        <Section title="Signature method" description="How signers signed"><Donut data={data.byMethod} label="Signatures by method" emptyText="Nothing was signed in this period." /></Section>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Code channel" description="How one-time codes were sent"><Donut data={data.byChannel} label="Codes by channel" emptyText="No codes were sent in this period." /></Section>
        <Section title="Compliance" description="From what is stored" className="lg:col-span-2">
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden /><span><strong>{nf.format(data.compliance.signed)}</strong> signed documents. Every signed copy states that it carries a simple electronic signature, not a wet signature or a signature with a certificate.</span></li>
            <li className="flex items-start gap-2"><Signature className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span><strong>{nf.format(data.compliance.stampPending)}</strong> documents need stamp duty. ContractFlow does not record stamp certificates yet, so these are not marked done.</span></li>
            <li className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden /><span><strong>{nf.format(data.compliance.renewalsSoon)}</strong> signed documents renew or expire in the next 30 days.</span></li>
          </ul>
          {canSettings && <Link href="/contractflow-ai/settings" className={`${buttonVariants({ size: "sm", variant: "outline" })} mt-3`}>Company controls</Link>}
        </Section>
      </div>

      <SectionDivider label="Needs attention" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AttentionCard title="Waiting for a signature (over 7 days)" empty="Nothing is overdue." items={a.awaitingSignature} tone="warn" />
        <AttentionCard title="Links expiring in 7 days" empty="No link is about to expire." items={a.expiringSoon} tone="warn" />
        <AttentionCard title="Viewed but not signed (3+ days)" empty="Nobody is sitting on a document." items={a.viewedNotSigned} tone="warn" />
        <AttentionCard title="Rejected, voided or expired recently" empty="Nothing closed in the last 14 days." items={a.recentlyClosed} tone="info" />
        <AttentionCard title="Code lockouts" empty="No signer is locked out." items={a.otpLockouts} tone="warn" />
        <AttentionCard title="Employees with unsigned letters" empty="No employee letter is waiting." items={a.employeesUnsigned} tone="info" />
        <AttentionCard title="Signed documents renewing in 30 days" empty="No renewal or expiry is coming up." items={a.renewalsSoon} tone="info" />
        <AttentionCard title="Stamp duty documents" empty="No document needs stamp duty." items={a.stampPending} tone="info" />
      </div>

      <SectionDivider label="Activity" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Recent activity" description="From the signing record" className="lg:col-span-2">
          {data.activity.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p> : (
            <ul className="divide-y divide-border/50">
              {data.activity.map((x, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="font-medium">{x.actor}</span> <span className="text-muted-foreground">{x.summary}</span>{x.documentId && <> · <Link className="text-primary hover:underline" href={`/contractflow-ai/clones/${encodeURIComponent(x.documentId)}`}>open</Link></>}</span>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={new Date(x.at).toISOString()}>{new Date(x.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}</time>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={data.scope === "all" ? "Top senders" : "You"} description="Requests sent in this period">
          {data.leaderboard.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nobody has sent anything in this period.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-1 font-semibold">Person</th><th className="py-1 text-right font-semibold">Sent</th><th className="py-1 text-right font-semibold">Signed</th></tr></thead>
              <tbody className="divide-y divide-border/50">{data.leaderboard.map((l, i) => <tr key={l.userId}><td className="py-1.5"><span className="mr-1.5 text-xs text-muted-foreground">{i + 1}</span>{l.name}</td><td className="py-1.5 text-right tabular-nums">{nf.format(l.sent)}</td><td className="py-1.5 text-right tabular-nums">{nf.format(l.signed)}</td></tr>)}</tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  );
}
