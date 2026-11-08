import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import StatusBadge, { PriorityBadge } from "@/components/support/StatusBadge";
import { AttachmentList } from "@/components/support/attachments";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getSupportConfig, labelOf, stateOf, statusOf } from "@/lib/support/config";
import { getAnyRequest } from "@/lib/support/requests";
import { cn, formatDateTime } from "@/lib/utils";
import Workbench from "./Workbench";

export const metadata: Metadata = { title: "Support request" };
export const dynamic = "force-dynamic";

export default async function SupportRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformPermission("support.read");
  const { id } = await params;
  const [cfg, found] = await Promise.all([getSupportConfig(), getAnyRequest(id)]);
  if (!found) notFound();
  const { request: r, messages } = found;
  const ctx = r.context;
  const typeDef = cfg.types.find((t) => t.key === r.type);

  return (
    <div className="space-y-4 p-1">
      <PanelPageHeader
        breadcrumbs={[{ label: "Platform", href: "/console" }, { label: "Support requests", href: "/console/resolveiq" }, { label: `#${r.number}` }]}
        title={<>{r.title}</>}
        description={<><span className="font-semibold text-foreground">{r.companyName}</span> · {r.createdBy.email} · {formatDateTime(r.createdAt)}</>}
        eyebrow={<>#{r.number} · {labelOf(cfg.types, r.type)} · {r.source === "chat" ? "from AI chat" : "from form"}</>}
        actions={<div className="flex items-center gap-2"><PriorityBadge label={labelOf(cfg.priorities, r.priority)} /><StatusBadge label={statusOf(cfg, r.status)?.label ?? r.status} state={stateOf(cfg, r.status)} /></div>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <GlassCard interactive={false} className="p-5">
            <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">{r.description}</p>
            <AttachmentList items={r.attachments} />
            {Object.keys(r.fields).length > 0 && (
              <dl className="mt-3 space-y-1.5 text-sm">
                {Object.entries(r.fields).map(([k, v]) => <div key={k}><dt className="text-xs font-medium text-muted-foreground">{typeDef?.fields.find((f) => f.key === k)?.label ?? k}</dt><dd className="whitespace-pre-wrap text-foreground/90">{v}</dd></div>)}
              </dl>
            )}
          </GlassCard>

          {ctx && (
            <GlassCard interactive={false} className="p-5">
              <p className="mb-2 text-sm font-semibold text-foreground">Captured context</p>
              <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                {([["Product", ctx.panel], ["Page", ctx.page], ["Route", ctx.route], ["Feature", ctx.feature], ["Browser", ctx.browser ? `${ctx.browser} ${ctx.browserVersion ?? ""}` : null], ["OS", ctx.os], ["Device", ctx.device], ["Viewport", ctx.viewport], ["Time", ctx.timestamp ? formatDateTime(ctx.timestamp) : null], ["Error", ctx.errorInfo]] as [string, string | null][])
                  .filter(([, v]) => v)
                  .map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-16 shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0 break-words text-foreground">{v}</dd></div>)}
              </dl>
            </GlassCard>
          )}

          {r.chat.length > 0 && (
            <GlassCard interactive={false} className="p-5">
              <p className="mb-2 text-sm font-semibold text-foreground">AI chat before this request</p>
              <div className="space-y-1.5 text-xs">{r.chat.map((t, i) => <p key={i}><span className="font-semibold text-muted-foreground">{t.role === "user" ? "User" : "Assistant"}:</span> <span className="whitespace-pre-wrap text-foreground/90">{t.text}</span></p>)}</div>
            </GlassCard>
          )}

          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m._id} className={cn("flex", m.authorType === "company" ? "justify-start" : "justify-end")}>
                <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm", m.visibility === "internal" ? "border border-dashed border-amber-500/50 bg-amber-500/10" : m.authorType === "company" ? "border border-border/60 bg-card" : "bg-primary/10")}>
                  <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{m.visibility === "internal" ? "Internal note · " : ""}{m.authorLabel} · {formatDateTime(m.createdAt)}</p>
                  {m.body && <p className="whitespace-pre-wrap text-foreground">{m.body}</p>}
                  <AttachmentList items={m.attachments} />
                </div>
              </div>
            ))}
          </div>

          <GlassCard interactive={false} className="p-5">
            <p className="mb-2 text-sm font-semibold text-foreground">History</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {[...r.history].reverse().map((h, i) => <li key={i}>{formatDateTime(h.at)} · {h.by} · {h.action}{h.to !== undefined ? `: ${h.from ?? "—"} → ${h.to ?? "—"}` : ""}</li>)}
            </ul>
          </GlassCard>
        </div>

        <Workbench request={r} config={cfg} me={{ id: user.id, email: user.email }} canManage={can(user, "support.manage")} />
      </div>
    </div>
  );
}
