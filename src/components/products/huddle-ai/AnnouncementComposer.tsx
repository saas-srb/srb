"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bold, Italic, List, Link2, Code, Eye, Paperclip, X, Loader2, Send, CalendarClock, FileDown } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Markdown } from "@/components/chat/Markdown";
import { saveAnnouncementAction, type AnnouncementInput } from "@/app/(products)/huddle-ai/(protected)/announcements/actions";
import type { Attachment } from "@/components/products/huddle-ai/types";

type AudienceKind = "everyone" | "roles" | "departments" | "channels";

interface Option {
  value: string;
  label: string;
}

interface Existing {
  _id: string;
  title: string;
  body: string;
  priority: "normal" | "important" | "critical";
  attachments: Attachment[];
  audience: { kind: AudienceKind; roles?: string[]; departmentIds?: string[]; channelIds?: string[] };
  scheduledFor: string | null;
  requireConfirmation: boolean;
  crossPost: boolean;
}

export default function AnnouncementComposer({
  existing,
  roleOptions,
  departmentOptions,
  channelOptions,
}: {
  existing?: Existing;
  roleOptions: Option[];
  departmentOptions: Option[];
  channelOptions: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [priority, setPriority] = useState(existing?.priority ?? "normal");
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
  const [uploading, setUploading] = useState(0);
  const [preview, setPreview] = useState(false);

  const [audienceKind, setAudienceKind] = useState<AudienceKind>(existing?.audience.kind ?? "everyone");
  const [roles, setRoles] = useState<Set<string>>(new Set(existing?.audience.roles ?? []));
  const [depts, setDepts] = useState<Set<string>>(new Set(existing?.audience.departmentIds ?? []));
  const [channels, setChannels] = useState<Set<string>>(new Set(existing?.audience.channelIds ?? []));

  const [scheduledFor, setScheduledFor] = useState(existing?.scheduledFor ? existing.scheduledFor.slice(0, 16) : "");
  const [requireConfirmation, setRequireConfirmation] = useState(existing?.requireConfirmation ?? false);
  const [crossPost, setCrossPost] = useState(existing?.crossPost ?? true);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function wrap(before: string, after = before) {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = body.slice(start, end);
    setBody(body.slice(0, start) + before + selected + after + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = end + before.length;
    });
  }

  async function upload(files: FileList) {
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/huddle-ai/announcements/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed.");
        setAttachments((a) => [...a, json.attachment as Attachment]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function buildAudience(): AnnouncementInput["audience"] {
    if (audienceKind === "roles") return { kind: "roles", roles: [...roles] } as AnnouncementInput["audience"];
    if (audienceKind === "departments") return { kind: "departments", departmentIds: [...depts] };
    if (audienceKind === "channels") return { kind: "channels", channelIds: [...channels] };
    return { kind: "everyone" };
  }

  function submit(action: "draft" | "schedule" | "publish") {
    setError(null);
    if (title.trim().length < 3) return setError("Give the announcement a title.");
    if (!body.trim()) return setError("Write something in the body.");
    if (action === "schedule" && !scheduledFor) return setError("Pick a date and time to schedule.");
    if (audienceKind === "roles" && roles.size === 0) return setError("Pick at least one role.");
    if (audienceKind === "departments" && depts.size === 0) return setError("Pick at least one department.");
    if (audienceKind === "channels" && channels.size === 0) return setError("Pick at least one channel.");

    const input: AnnouncementInput = {
      title,
      body,
      priority,
      attachments,
      audience: buildAudience(),
      scheduledFor: action === "schedule" ? new Date(scheduledFor).toISOString() : null,
      requireConfirmation,
      crossPost,
      publishNow: action === "publish",
    };

    startTransition(async () => {
      const res = await saveAnnouncementAction(input, existing?._id);
      if (!res.ok) return setError(res.error ?? "Could not save.");
      router.push(res.id ? `/huddle-ai/announcements/${res.id}` : "/huddle-ai/announcements");
      router.refresh();
    });
  }

  const multi = (
    label: string,
    options: Option[],
    selected: Set<string>,
    setSelected: (s: Set<string>) => void
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-border/60 p-1">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted">
            <input
              type="checkbox"
              checked={selected.has(o.value)}
              onChange={() => {
                const n = new Set(selected);
                if (n.has(o.value)) n.delete(o.value);
                else n.add(o.value);
                setSelected(n);
              }}
              className="accent-primary"
            />
            {o.label}
          </label>
        ))}
        {options.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Nothing available.</p>}
      </div>
    </div>
  );

  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle>{existing ? "Edit announcement" : "New announcement"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ann-title">Title</Label>
          <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline" autoFocus />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ann-body">Body</Label>
            <div className="flex items-center gap-0.5">
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => wrap("**")} aria-label="Bold">
                <Bold className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => wrap("_")} aria-label="Italic">
                <Italic className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => wrap("\n- ", "")} aria-label="List">
                <List className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => wrap("[", "](url)")} aria-label="Link">
                <Link2 className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => wrap("`")} aria-label="Code">
                <Code className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant={preview ? "default" : "ghost"}
                size="icon-xs"
                onClick={() => setPreview((v) => !v)}
                aria-label="Toggle preview"
              >
                <Eye className="size-3.5" />
              </Button>
            </div>
          </div>
          {preview ? (
            <div className="min-h-40 rounded-xl border border-border/60 bg-background p-3">
              <Markdown content={body || "_Nothing to preview yet._"} />
            </div>
          ) : (
            <textarea
              id="ann-body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Write your announcement. Markdown supported."
              className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          )}
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <span key={a.storageKey} className="lms-chip max-w-[220px]">
                {a.kind === "image" ? "🖼️" : <FileDown className="size-3" />}
                <span className="truncate">{a.filename}</span>
                <button type="button" onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))} aria-label="Remove">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
            {uploading > 0 ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Paperclip className="size-3.5" data-icon="inline-start" />}
            Attach files
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files);
              e.target.value = "";
            }}
          />

          <div className="flex flex-col gap-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority((v ?? "normal") as typeof priority)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="important">Important</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Audience</Label>
            <Select value={audienceKind} onValueChange={(v) => setAudienceKind((v ?? "everyone") as AudienceKind)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="roles">By role</SelectItem>
                <SelectItem value="departments">By department</SelectItem>
                <SelectItem value="channels">By channel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {audienceKind === "roles" && multi("Roles", roleOptions, roles, setRoles)}
        {audienceKind === "departments" && multi("Departments", departmentOptions, depts, setDepts)}
        {audienceKind === "channels" && multi("Channels", channelOptions, channels, setChannels)}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ann-schedule">Schedule for (optional)</Label>
            <Input id="ann-schedule" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
          </div>
          <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={requireConfirmation} onChange={(e) => setRequireConfirmation(e.target.checked)} className="accent-primary" />
              Require read confirmation
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={crossPost} onChange={(e) => setCrossPost(e.target.checked)} className="accent-primary" />
              Also post to #announcement
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
          <Button type="button" disabled={pending} onClick={() => submit("publish")}>
            {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Send className="size-3.5" data-icon="inline-start" />}
            Publish now
          </Button>
          <Button type="button" variant="outline" disabled={pending || !scheduledFor} onClick={() => submit("schedule")}>
            <CalendarClock className="size-3.5" data-icon="inline-start" />
            Schedule
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => submit("draft")}>
            Save draft
          </Button>
        </div>
      </CardContent>
    </GlassCard>
  );
}
