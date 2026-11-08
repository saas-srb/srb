"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createRequestAction } from "@/app/(products)/resolveiq/actions";
import { AttachmentPicker, useAttachments } from "@/components/support/attachments";
import { currentContext } from "@/lib/support/client-context";
import type { ChatTurn, OptionDef, RequestContext, RequestTypeDef } from "@/lib/support/types";

export interface RequestFormConfig {
  types: RequestTypeDef[];
  priorities: OptionDef[];
  categories: OptionDef[];
  severities: OptionDef[];
}

export interface RequestFormInitial {
  type?: string;
  title?: string;
  description?: string;
  priority?: string;
  category?: string | null;
}

const INPUT = "w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const Label = ({ children }: { children: React.ReactNode }) => <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{children}</label>;

/**
 * One form for every request type: the type decides the extra fields (and, for bug-like types, the severity). Where the
 * user is, their browser and device are captured automatically and shown — they never have to type them.
 */
export default function RequestForm({ config, initial, chat, source = "form", compact = false }: { config: RequestFormConfig; initial?: RequestFormInitial; chat?: ChatTurn[]; source?: "form" | "chat"; compact?: boolean }) {
  const [type, setType] = useState(initial?.type && config.types.some((t) => t.key === initial.type) ? initial.type : config.types[0]?.key ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? config.priorities[0]?.key ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [severity, setSeverity] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [context] = useState<RequestContext | null>(() => (typeof window === "undefined" ? null : currentContext()));
  const [errorInfo, setErrorInfo] = useState("");
  const files = useAttachments();
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<{ id: string; number: number } | null>(null);
  const def = config.types.find((t) => t.key === type);

  if (created) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <p className="text-sm font-semibold text-foreground">Request #{created.number} sent</p>
        <p className="text-xs text-muted-foreground">We&apos;ll reply here and notify you when there&apos;s an update.</p>
        <Link href={`/resolveiq/requests/${created.id}`} className="mt-1 text-sm font-medium text-primary hover:underline">View request →</Link>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createRequestAction({
        type,
        title,
        description,
        priority,
        category: category || null,
        severity: def?.kind === "bug" ? severity || null : null,
        fields,
        context: context ? { ...context, errorInfo: errorInfo.trim() || null } : null,
        source,
        chat,
        attachments: files.items,
      });
      if (!res.ok) { toast.error(res.error); return; }
      setCreated({ id: res.id, number: res.number });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={compact ? "space-y-3" : "grid gap-4 sm:grid-cols-2"}>
        <div>
          <Label>Request type</Label>
          <select value={type} onChange={(e) => { setType(e.target.value); setFields({}); }} className={INPUT}>
            {config.types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          {def?.description && <p className="mt-1 text-[11px] text-muted-foreground">{def.description}</p>}
        </div>
        <div>
          <Label>Priority</Label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={INPUT}>
            {config.priorities.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <Label>Title</Label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="A short summary" className={INPUT} required />
      </div>
      <div>
        <Label>Description</Label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} onPaste={files.onPaste} rows={compact ? 5 : 7} maxLength={8000} placeholder="What do you need, or what went wrong?" className={INPUT} required />
      </div>

      <AttachmentPicker state={files} />

      {def?.fields.map((f) => (
        <div key={f.key}>
          <Label>{f.label}{f.required ? " *" : ""}</Label>
          {f.type === "textarea" ? (
            <textarea value={fields[f.key] ?? ""} onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))} rows={3} className={INPUT} required={f.required} />
          ) : f.type === "select" ? (
            <select value={fields[f.key] ?? ""} onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))} className={INPUT} required={f.required}>
              <option value="">Select…</option>
              {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input value={fields[f.key] ?? ""} onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))} className={INPUT} required={f.required} />
          )}
        </div>
      ))}

      <div className={compact ? "space-y-3" : "grid gap-4 sm:grid-cols-2"}>
        {config.categories.length > 0 && (
          <div>
            <Label>Category (optional)</Label>
            <select value={category ?? ""} onChange={(e) => setCategory(e.target.value)} className={INPUT}>
              <option value="">Not sure</option>
              {config.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
        )}
        {def?.kind === "bug" && config.severities.length > 0 && (
          <div>
            <Label>How severe is it?</Label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={INPUT}>
              <option value="">Not sure</option>
              {config.severities.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {def?.kind === "bug" && (
        <div>
          <Label>Error message (optional)</Label>
          <textarea value={errorInfo} onChange={(e) => setErrorInfo(e.target.value)} rows={2} maxLength={2000} placeholder="Paste any error text you saw" className={INPUT} />
        </div>
      )}

      {context && (
        <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted/40 p-3 text-[11px] text-muted-foreground">
          <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            Sent automatically so you don&apos;t have to type it: {[context.panel && `product ${context.panel}`, context.page && `page “${context.page}”`, context.browser && `${context.browser} ${context.browserVersion?.split(".")[0] ?? ""}`.trim(), context.os, context.device].filter(Boolean).join(" · ")}.
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending || !type || files.uploading > 0}>
        {pending && <Loader2 className="size-4 animate-spin" />} Send request
      </Button>
    </form>
  );
}
