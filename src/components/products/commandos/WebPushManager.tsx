"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, MousePointerClick, Save, Send, Users } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { WEB_PUSH_TOPICS, WEB_PUSH_TOPIC_META, type WebPushSettings, type WebPushTopic } from "@/lib/webpush/topics";
import { saveWebPushSettingsAction, sendWebPushAction } from "@/app/(products)/commandos/(protected)/push/actions";

interface Row {
  id: string;
  topic: WebPushTopic;
  title: string;
  body: string;
  url: string;
  trigger: "manual" | "offer" | "reward" | "post";
  status: "sending" | "sent" | "partial" | "failed" | "skipped";
  note: string | null;
  targeted: number;
  sent: number;
  failed: number;
  clicks: number;
  createdAt: string;
}

const TRIGGER_LABEL: Record<Row["trigger"], string> = { manual: "Sent by you", offer: "Offer went live", reward: "Reward campaign", post: "Post published" };
const STATUS_STYLE: Record<Row["status"], string> = {
  sent: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  partial: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  failed: "bg-destructive/10 text-destructive",
  skipped: "bg-muted text-muted-foreground",
  sending: "bg-primary/10 text-primary",
};
const QUICK_LINKS = [
  { label: "Home", url: "/" },
  { label: "Offers", url: "/offers" },
  { label: "Rewards", url: "/rewards" },
  { label: "Blog", url: "/blog" },
];

export default function WebPushManager({
  serverReady,
  initialSettings,
  stats,
  broadcasts,
}: {
  serverReady: boolean;
  initialSettings: WebPushSettings;
  stats: { total: number; last7Days: number; byTopic: Record<WebPushTopic, number> };
  broadcasts: Row[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, startSave] = useTransition();
  const [sending, startSend] = useTransition();
  const [form, setForm] = useState({ topic: "offers" as WebPushTopic, title: "", body: "", url: "/offers" });
  const [confirming, setConfirming] = useState(false);

  const audience = stats.byTopic[form.topic] ?? 0;
  const set = (patch: Partial<WebPushSettings>) => setSettings((s) => ({ ...s, ...patch }));

  const save = () =>
    startSave(async () => {
      const res = await saveWebPushSettingsAction(settings);
      if (!res.ok) toast.error(res.error);
      else {
        setSettings(res.settings);
        toast.success("Saved");
      }
    });

  const send = () =>
    startSend(async () => {
      const res = await sendWebPushAction(form);
      setConfirming(false);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Sent to ${res.sent} of ${res.targeted} subscribers${res.partial ? " (stopped early — send again for the rest)" : ""}`);
      setForm((f) => ({ ...f, title: "", body: "" }));
    });

  const ready = settings.enabled && serverReady;

  return (
    <div className="space-y-6">
      {!serverReady ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Push notifications aren&apos;t set up on this server yet, so nothing can be sent. The platform administrator needs to configure the push keys.
        </div>
      ) : null}

      {/* stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <GlassCard className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="size-4" /> Subscribers</div><p className="mt-1 text-2xl font-semibold">{stats.total}</p><p className="text-xs text-muted-foreground">{stats.last7Days} new in the last 7 days</p></GlassCard>
        {(["offers", "rewards"] as const).map((t) => (
          <GlassCard key={t} className="p-4"><div className="text-xs text-muted-foreground">{WEB_PUSH_TOPIC_META[t].label}</div><p className="mt-1 text-2xl font-semibold">{stats.byTopic[t]}</p><p className="text-xs text-muted-foreground">subscribed to this topic</p></GlassCard>
        ))}
      </div>

      {/* settings */}
      <GlassCard className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Website notifications</h2>
            <p className="text-sm text-muted-foreground">When on, visitors see a small bell on your website asking if they want notifications. Nothing is shown or sent while this is off.</p>
          </div>
          <Checkbox aria-label="Website notifications" checked={settings.enabled} onCheckedChange={(v) => set({ enabled: v === true })} />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Topics visitors can choose</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {WEB_PUSH_TOPICS.map((t) => (
              <label key={t} className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2">
                <Checkbox checked={settings.topics[t]} onCheckedChange={(v) => set({ topics: { ...settings.topics, [t]: v === true } })} className="mt-0.5" />
                <span><span className="block text-sm font-medium">{WEB_PUSH_TOPIC_META[t].label}</span><span className="block text-xs text-muted-foreground">{WEB_PUSH_TOPIC_META[t].description}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Send automatically when…</legend>
          {([
            ["offers", "A festival offer campaign goes live", "Notifies the Offers topic."],
            ["rewards", "A reward or referral campaign is switched on", "Notifies the Credits and rewards topic."],
            ["updates", "A blog post is published", "Notifies the News and updates topic."],
          ] as const).map(([key, label, hint]) => (
            <label key={key} className="flex items-start gap-2.5">
              <Checkbox checked={settings.automations[key]} onCheckedChange={(v) => set({ automations: { ...settings.automations, [key]: v === true } })} className="mt-0.5" />
              <span><span className="block text-sm">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
            </label>
          ))}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wp-cap">Most notifications per day</Label>
            <Input id="wp-cap" type="number" min={1} max={20} value={settings.dailyCap} onChange={(e) => set({ dailyCap: Number(e.target.value) })} />
            <p className="text-xs text-muted-foreground">Automatic and manual sends together. Keeps you from over-messaging visitors.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wp-delay">Ask visitors after (seconds)</Label>
            <Input id="wp-delay" type="number" min={0} max={300} value={settings.promptDelaySeconds} onChange={(e) => set({ promptDelaySeconds: Number(e.target.value) })} />
            <p className="text-xs text-muted-foreground">How long after a page opens the permission card appears.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wp-ptitle">Permission card title</Label>
          <Input id="wp-ptitle" maxLength={60} value={settings.promptTitle} onChange={(e) => set({ promptTitle: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wp-ptext">Permission card text</Label>
          <Textarea id="wp-ptext" rows={2} maxLength={200} value={settings.promptText} onChange={(e) => set({ promptText: e.target.value })} />
        </div>
        <Button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Save className="size-4" data-icon="inline-start" />} Save settings</Button>
      </GlassCard>

      {/* compose */}
      <GlassCard className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold">Send a notification</h2>
          <p className="text-sm text-muted-foreground">Goes to visitors who subscribed to the topic. Keep it short and useful.</p>
        </div>
        {!ready ? <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">Turn on website notifications above and save to start sending.</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wp-topic">Topic</Label>
            <select id="wp-topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value as WebPushTopic })} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              {WEB_PUSH_TOPICS.filter((t) => settings.topics[t]).map((t) => <option key={t} value={t}>{WEB_PUSH_TOPIC_META[t].label} ({stats.byTopic[t]})</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wp-url">Opens this page</Label>
            <Input id="wp-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="/offers" />
            <div className="flex flex-wrap gap-1.5">{QUICK_LINKS.map((l) => <button key={l.url} type="button" onClick={() => setForm({ ...form, url: l.url })} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">{l.label}</button>)}</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wp-title">Title <span className="text-xs text-muted-foreground">({form.title.length}/65)</span></Label>
          <Input id="wp-title" maxLength={65} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Diwali sale is live — up to 40% off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wp-body">Message <span className="text-xs text-muted-foreground">({form.body.length}/180)</span></Label>
          <Textarea id="wp-body" rows={2} maxLength={180} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Tap to see this week's offers before they're gone." />
        </div>

        {(form.title || form.body) ? (
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <p className="text-sm font-semibold">{form.title || "Title"}</p>
            <p className="text-sm text-muted-foreground">{form.body}</p>
          </div>
        ) : null}

        {confirming ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm">Send to <strong>{audience}</strong> subscriber{audience === 1 ? "" : "s"} now? This can&apos;t be undone.</p>
            <Button type="button" size="sm" onClick={send} disabled={sending}>{sending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Send className="size-4" data-icon="inline-start" />} Yes, send</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={sending}>Cancel</Button>
          </div>
        ) : (
          <Button type="button" onClick={() => setConfirming(true)} disabled={!ready || !form.title.trim() || audience === 0}>
            <Send className="size-4" data-icon="inline-start" /> {audience === 0 && ready ? "No subscribers yet" : "Send notification"}
          </Button>
        )}
      </GlassCard>

      {/* history */}
      <GlassCard className="p-5">
        <h2 className="text-base font-semibold">History</h2>
        {broadcasts.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {broadcasts.map((b) => (
              <li key={b.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{b.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[b.status]}`}>{b.status}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {WEB_PUSH_TOPIC_META[b.topic].label} · {TRIGGER_LABEL[b.trigger]} · <time dateTime={b.createdAt} suppressHydrationWarning>{new Date(b.createdAt).toLocaleString()}</time>
                </p>
                <p className="flex flex-wrap items-center gap-x-4 text-xs text-muted-foreground">
                  <span>{b.sent} delivered of {b.targeted}</span>
                  {b.failed ? <span>{b.failed} failed</span> : null}
                  <span className="inline-flex items-center gap-1"><MousePointerClick className="size-3" />{b.clicks} opened</span>
                  {b.note ? <span>{b.note}</span> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
