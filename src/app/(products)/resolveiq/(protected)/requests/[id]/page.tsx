import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import ReplyBox from "@/components/support/ReplyBox";
import { AttachmentList } from "@/components/support/attachments";
import StatusBadge, { PriorityBadge } from "@/components/support/StatusBadge";
import { getCompanyCaller } from "@/lib/support/caller";
import { getSupportConfig, labelOf, stateOf, statusOf } from "@/lib/support/config";
import { getForCompany } from "@/lib/support/requests";
import { cn, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const caller = await getCompanyCaller();
  if (!caller) redirect("/commandos/login");
  const { id } = await params;
  // Pinned to the caller's company: another company's id simply isn't found.
  const [cfg, found] = await Promise.all([getSupportConfig(), getForCompany(caller.companyId, id)]);
  if (!found) notFound();
  const { request: r, messages } = found;
  const state = stateOf(cfg, r.status);

  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[{ label: "Help & Support", href: "/resolveiq" }, { label: "My Requests", href: "/resolveiq/requests" }, { label: `#${r.number}` }]}
        title={<>{r.title}</>}
        description={<>#{r.number} · {labelOf(cfg.types, r.type)}</>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge label={labelOf(cfg.priorities, r.priority)} />
            <StatusBadge label={statusOf(cfg, r.status)?.label ?? r.status} state={state} />
          </div>
        }
      />
<div className="space-y-4">
      <GlassCard interactive={false} className="p-5 sm:p-6">
        <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">{r.description}</p>
        <AttachmentList items={r.attachments} />
        {Object.keys(r.fields).length > 0 && (
          <dl className="mt-3 space-y-1.5 text-sm">
            {Object.entries(r.fields).map(([k, v]) => {
              const label = cfg.types.find((t) => t.key === r.type)?.fields.find((f) => f.key === k)?.label ?? k;
              return <div key={k}><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap text-foreground/90">{v}</dd></div>;
            })}
          </dl>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Sent by {r.createdBy.email} · {formatDateTime(r.createdAt)}</p>
      </GlassCard>

      <div className="space-y-3">
        {messages.map((m) => (
          <div key={m._id} className={cn("flex", m.authorType === "company" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm", m.authorType === "company" ? "rounded-tr-sm bg-primary/10" : "rounded-tl-sm border border-border/60 bg-card")}>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{m.authorType === "staff" ? "Support team" : m.authorLabel} · {formatDateTime(m.createdAt)}</p>
              {m.body && <p className="whitespace-pre-wrap text-foreground">{m.body}</p>}
              <AttachmentList items={m.attachments} />
            </div>
          </div>
        ))}
        {messages.length === 0 && <p className="text-center text-xs text-muted-foreground">No replies yet. The support team has your request and will respond here.</p>}
      </div>

      <GlassCard interactive={false} className="p-4">
        <ReplyBox requestId={r._id} closed={state === "closed"} resolved={state === "resolved"} />
      </GlassCard>
    </div>
</div>
  );
}
