"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Bell, CalendarClock, ChevronDown, ChevronRight, Loader2, Lock, Mail, Megaphone, Pencil, Plus, RotateCcw, Search, Send, Smartphone, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { eventName } from "@/lib/notify/center/event-names";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ANNOUNCEMENT_STATUS_LABEL, CHANNELS, CHANNEL_LABEL, DEFAULT_BUTTON, DEFAULT_FOOTNOTE, DEFAULT_GREETING, EMAIL_VALUES, LIMITS, exampleValues, expandText, extractValues, placeholdersOf, unknownVariables, type ExpandContext, type AnnouncementAudience, type AnnouncementStatus, type AnnouncementView, type ChannelKey, type LogEntry, type LogStatus } from "@/lib/notify/center/shared";
import type { RuleView } from "@/lib/notify/center/store";
import { cancelAnnouncementAction, createAnnouncementAction, deleteAnnouncementAction, loadLogAction, previewEmailAction, resetRuleAction, sendAnnouncementNowAction, updateAnnouncementAction, updateRuleAction } from "@/app/(products)/commandos/(protected)/settings/notifications/actions";

const ICON: Record<ChannelKey, typeof Bell> = { inApp: Bell, push: Smartphone, email: Mail };
const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

export interface CenterProps {
  rules: RuleView[];
  products: { key: string; name: string }[];
  roles: { value: string; label: string }[];
  people: { id: string; label: string }[];
  announcements: AnnouncementView[];
  /** The company name, for previews. */
  brand: string;
  summary: Record<ChannelKey, { sent: number; failed: number; off: number }>;
  canEdit: boolean;
  /** Events SelfRun has switched off for every company, by channel: they cannot be turned back on here. */
  platformOff: Record<string, Partial<Record<ChannelKey, false>>>;
}

function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-primary" : "bg-muted-foreground/30"}`}>
      <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function NotificationCenter(props: CenterProps) {
  const [tab, setTab] = useState<"rules" | "announcements" | "activity">("rules");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {CHANNELS.map((c) => {
          const Icon = ICON[c];
          const s = props.summary[c];
          return (
            <div key={c} className="rounded-2xl border border-border/60 bg-card/70 p-4">
              <p className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 text-primary" /> {CHANNEL_LABEL[c]} · last 24 hours</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{s.sent}<span className="ml-1 text-xs font-normal text-muted-foreground">sent</span></p>
              <p className="text-xs text-muted-foreground">{s.failed} failed · {s.off} held back by a rule</p>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/40 p-1 text-sm font-medium" role="tablist">
        {([["rules", "Notifications"], ["announcements", "Announcements"], ["activity", "Activity"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${tab === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
        ))}
      </div>
      {tab === "rules" ? <Rules {...props} /> : tab === "announcements" ? <Announcements {...props} /> : <Activity products={props.products} />}
    </div>
  );
}

// ── Rules ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function Rules({ rules: initial, products, canEdit, brand, platformOff }: CenterProps) {
  const [rules, setRules] = useState(initial);
  const [q, setQ] = useState("");
  const [product, setProduct] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const productName = useMemo(() => new Map([...products.map((p) => [p.key, p.name] as const), ["workspace", "Workspace"], ["account", "Account & billing"]]), [products]);

  const replace = (r: RuleView) => setRules((rs) => rs.map((x) => (x.key === r.key ? r : x)));
  const shown = rules.filter((r) => (product === "all" || r.product === product) && (!q.trim() || `${r.name} ${r.description} ${r.key}`.toLowerCase().includes(q.trim().toLowerCase())));
  const groups = [...new Set(shown.map((r) => r.product))].sort((a, b) => (productName.get(a) ?? a).localeCompare(productName.get(b) ?? b));
  const productOptions = [...new Set(rules.map((r) => r.product))].sort((a, b) => (productName.get(a) ?? a).localeCompare(productName.get(b) ?? b));

  const toggle = async (r: RuleView, ch: ChannelKey, enabled: boolean) => {
    setError(null);
    const before = rules;
    replace({ ...r, channels: { ...r.channels, [ch]: { ...r.channels[ch], enabled } } });
    const res = await updateRuleAction(r.key, { channels: { [ch]: { enabled } } }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Could not save." }));
    if (!res.ok) {
      setRules(before);
      setError(res.error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notifications" className="pl-9" aria-label="Search notifications" />
        </div>
        <select value={product} onChange={(e) => setProduct(e.target.value)} className={selectClass} aria-label="Product">
          <option value="all">All products</option>
          {productOptions.map((p) => <option key={p} value={p}>{productName.get(p) ?? p}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      {groups.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No notifications match.</p>}
      {groups.map((g) => (
        <section key={g} className="overflow-hidden rounded-2xl border border-border/60 bg-card/70">
          <h3 className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold">{productName.get(g) ?? g} <span className="ml-1 text-xs font-normal text-muted-foreground">{shown.filter((r) => r.product === g).length}</span></h3>
          <ul className="divide-y">
            {shown.filter((r) => r.product === g).map((r) => (
              <li key={r.key} data-rule={r.key}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button type="button" className="flex min-w-48 flex-1 items-start gap-2 text-left" onClick={() => setOpen(open === r.key ? null : r.key)} aria-expanded={open === r.key}>
                    {open === r.key ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">{r.name}{r.locked && <Badge variant="outline"><Lock /> Always on</Badge>}</span>
                      <span className="block text-xs text-muted-foreground">{r.description}</span>
                    </span>
                  </button>
                  <div className="flex items-center gap-4">
                    {CHANNELS.map((c) => {
                      const Icon = ICON[c];
                      const ch = r.channels[c];
                      const held = platformOff[r.key]?.[c] === false;
                      return (
                        <label key={c} className={`flex items-center gap-1.5 text-xs ${ch.unavailable ? "opacity-30" : ""}`} title={held ? `${CHANNEL_LABEL[c]} is turned off by SelfRun for every workspace` : ch.unavailable ? `${CHANNEL_LABEL[c]} isn't used for this` : r.locked ? "Security and billing emails can't be turned off" : CHANNEL_LABEL[c]}>
                          <Icon className="size-3.5" />
                          <Switch on={ch.enabled && !ch.unavailable && !held} disabled={!canEdit || !!ch.unavailable || r.locked || held} label={`${CHANNEL_LABEL[c]} for ${r.name}`} onChange={(v) => toggle(r, c, v)} />
                        </label>
                      );
                    })}
                  </div>
                </div>
                {open === r.key && <Editor rule={r} canEdit={canEdit} brand={brand} onChange={replace} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type Field = "subject" | "title" | "body" | "greeting" | "button" | "footnote";
const FIELDS_OF: Record<ChannelKey, { f: Field; label: string; kind: "line" | "text" }[]> = {
  inApp: [{ f: "title", label: "Title", kind: "line" }, { f: "body", label: "Text", kind: "text" }],
  push: [{ f: "title", label: "Title", kind: "line" }, { f: "body", label: "Text", kind: "text" }],
  email: [
    { f: "subject", label: "Subject", kind: "line" },
    { f: "title", label: "Heading", kind: "line" },
    { f: "greeting", label: "Greeting", kind: "line" },
    { f: "body", label: "Message", kind: "text" },
    { f: "button", label: "Button label", kind: "line" },
    { f: "footnote", label: "Small print", kind: "text" },
  ],
};
const MAX: Record<Field, number> = { subject: LIMITS.subject, title: LIMITS.title, body: LIMITS.body, greeting: LIMITS.greeting, button: LIMITS.button, footnote: LIMITS.footnote };
const humanName = (n: string) => n.split("/")[0].replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

function Editor({ rule, canEdit, brand, onChange }: { rule: RuleView; canEdit: boolean; brand: string; onChange: (r: RuleView) => void }) {
  const channels = CHANNELS.filter((c) => !rule.channels[c].unavailable);
  const own = useMemo(() => [...new Set([...placeholdersOf(rule.original?.title), ...placeholdersOf(rule.original?.body)])], [rule.original]);
  // Examples for the preview only: the fields themselves keep the { } values.
  const values = useMemo<Record<string, string>>(() => ({ ...exampleValues([...own, ...EMAIL_VALUES]), company: brand }), [own, brand]);
  // Until a field is changed it holds the product's own wording, with everything that changes each time in { }.
  const ctx: ExpandContext = useMemo(() => ({ values, company: brand, title: rule.original?.title ? null : (rule.sample?.title ?? null), body: rule.original?.body ? null : (rule.sample?.body ?? null) }), [values, brand, rule.original, rule.sample]);
  const DEFAULT: Record<Field, string> = { subject: rule.original?.title || "{{title}}", title: rule.original?.title || "{{title}}", body: rule.original?.body || "{{body}}", greeting: DEFAULT_GREETING, button: DEFAULT_BUTTON, footnote: DEFAULT_FOOTNOTE };
  const storedOf = (r: RuleView, c: ChannelKey, f: Field) => ((r.channels[c] as unknown as Record<string, string | undefined>)[f] || DEFAULT[f]).replace(/\{\{\s*company\s*\}\}/g, "{company}");
  const fieldsOf = (r: RuleView) => Object.fromEntries(channels.map((c) => [c, Object.fromEntries(FIELDS_OF[c].map(({ f }) => [f, storedOf(r, c, f)]))])) as Record<ChannelKey, Record<string, string>>;
  const [text, setText] = useState(() => fieldsOf(rule));
  const [channel, setChannel] = useState<ChannelKey>(channels[0] ?? "inApp");
  const [focus, setFocus] = useState<Field>("title");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const known = [...own, ...EMAIL_VALUES];
  const original = (f: Field) => DEFAULT[f];
  const bad = [...new Set(channels.flatMap((c) => FIELDS_OF[c].flatMap(({ f }) => unknownVariables(text[c][f] ?? "", known))))];
  const changed = channels.some((c) => FIELDS_OF[c].some(({ f }) => text[c][f] !== storedOf(rule, c, f)));
  const unfillable = !!rule.sample && own.length > 0 && (extractValues(rule.original?.title, rule.sample.title) === null || extractValues(rule.original?.body, rule.sample.body ?? "") === null);

  const set = (c: ChannelKey, f: Field, v: string) => setText((t) => ({ ...t, [c]: { ...t[c], [f]: v } }));
  const insert = (value: string) => set(channel, focus, `${text[channel][focus] ?? ""}${text[channel][focus] && !text[channel][focus].endsWith(" ") ? " " : ""}${value}`);
  const chips = [...own.map((n) => ({ label: humanName(n), token: `{${n}}`, example: values[n] })), { label: "Company name", token: "{company}", example: brand }, ...(channel === "email" ? [{ label: "First name", token: "{firstName}", example: values.firstName }, { label: "Settings link", token: "{settingsLink}", example: values.settingsLink }] : [])];

  const save = () =>
    start(async () => {
      // A field still holding the original wording means "keep the original": nothing is stored for it.
      const patch = Object.fromEntries(channels.map((c) => [c, Object.fromEntries(FIELDS_OF[c].map(({ f }) => { const t = (text[c][f] ?? "").trim(); return [f, t === DEFAULT[f].trim().replace(/\{\{\s*company\s*\}\}/g, "{company}") ? "" : t]; }))]));
      const res = await updateRuleAction(rule.key, { channels: patch }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Could not save." }));
      if (res.ok) {
        onChange(res.rule);
        setText(fieldsOf(res.rule));
        setMsg({ ok: true, text: "Saved." });
      } else setMsg({ ok: false, text: res.error });
    });

  if (rule.locked) {
    return (
      <div className="space-y-2 border-t bg-muted/20 px-4 py-4 text-sm">
        <p className="text-muted-foreground">This is a security or billing email: it is always sent and its wording is fixed.</p>
        <p className="text-xs text-muted-foreground">{rule.description}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t bg-muted/20 px-4 py-4">
      <div className="rounded-xl border bg-background p-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Original wording in the product</p>
        <p className="mt-1.5"><span className="text-muted-foreground">Title: </span>{rule.original?.title ? rule.original.title : <span className="text-muted-foreground">no fixed title</span>}</p>
        <p><span className="text-muted-foreground">Text: </span>{rule.original?.body ? rule.original.body : <span className="text-muted-foreground">none</span>}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {rule.sample ? <>Last real example, {new Date(rule.sample.at).toLocaleString()}: <span className="text-foreground">{rule.sample.title}{rule.sample.body ? ` — ${rule.sample.body}` : ""}</span></> : "Not sent yet in this workspace. Anything in { } is filled in with the real value each time it is sent."}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border bg-background p-1 text-sm font-medium" role="tablist" aria-label="Channel">
        {channels.map((c) => {
          const Icon = ICON[c];
          return <button key={c} type="button" role="tab" aria-selected={channel === c} onClick={() => { setChannel(c); setFocus("title"); }} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${channel === c ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}><Icon className="size-4" /> {CHANNEL_LABEL[c]}{!rule.channels[c].enabled && <span className="rounded bg-muted px-1 text-[10px] font-normal">off</span>}</button>;
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {FIELDS_OF[channel].map(({ f, label, kind }) => (
            <div key={f} className="space-y-1.5">
              <div className="flex items-center justify-between"><Label>{label}</Label>{text[channel][f] !== storedOf({ ...rule, channels: { ...rule.channels, [channel]: { ...rule.channels[channel], [f]: "" } } }, channel, f) && canEdit && <button type="button" className="text-xs text-primary hover:underline" onClick={() => set(channel, f, storedOf({ ...rule, channels: { ...rule.channels, [channel]: { ...rule.channels[channel], [f]: "" } } }, channel, f))}>Use original</button>}</div>
              {kind === "text" ? (
                <Textarea className="bg-background" value={text[channel][f] ?? ""} maxLength={MAX[f]} rows={f === "footnote" ? 3 : 4} disabled={!canEdit} onFocus={() => setFocus(f)} onChange={(e) => set(channel, f, e.target.value)} aria-label={`${CHANNEL_LABEL[channel]} ${label}`} />
              ) : (
                <Input className="bg-background" value={text[channel][f] ?? ""} maxLength={MAX[f]} disabled={!canEdit} onFocus={() => setFocus(f)} onChange={(e) => set(channel, f, e.target.value)} aria-label={`${CHANNEL_LABEL[channel]} ${label}`} />
              )}
            </div>
          ))}
          {canEdit && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Click to add a value that changes every time, into the field you are editing:</p>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c) => <button key={c.token} type="button" onClick={() => insert(c.token)} className="rounded-full border bg-background px-2.5 py-0.5 font-mono text-xs hover:bg-muted" title={`${c.label}: shown as “${c.example}” in the preview, replaced by the real value when sent`}>{c.token}</button>)}
              </div>
              <p className="text-xs text-muted-foreground">Everything in <span className="font-mono">{"{ }"}</span> is dynamic: the real value is put in each time it is sent. Keep it where the value should appear; the rest is plain text you can reword.</p>
              {unfillable && <p className="text-xs text-amber-700 dark:text-amber-300">This notification words itself differently in some cases, so its values can&apos;t always be filled in. Where they can&apos;t, the original wording is sent.</p>}
            </div>
          )}
          {bad.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Unknown placeholder{bad.length > 1 ? "s" : ""}: {bad.join(", ")} — this notification can&apos;t fill them, so the original wording is sent instead.</p>}
        </div>
        <Preview channel={channel} brand={brand} fields={Object.fromEntries(Object.entries(text[channel]).map(([k, v]) => [k, expandText(v, ctx)]))} enabled={rule.channels[channel].enabled} real={!!rule.sample} />
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={save} disabled={pending || !changed}>{pending && <Loader2 className="size-4 animate-spin" />} Save</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => { const res = await resetRuleAction(rule.key); if (res.ok) { onChange(res.rule); setText(fieldsOf(res.rule)); setMsg({ ok: true, text: "Back to the original." }); } else setMsg({ ok: false, text: res.error }); })}><RotateCcw className="size-4" /> Reset to original</Button>
          {msg && <span role="status" className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}

/** How the notification looks on the channel being edited, with the wording as typed. */
function Preview({ channel, brand, fields, enabled, real }: { channel: ChannelKey; brand: string; fields: Record<string, string>; enabled: boolean; real: boolean }) {
  const [html, setHtml] = useState<{ subject: string; html: string } | null>(null);
  const [error, setError] = useState(false);
  const key = JSON.stringify(fields);
  useEffect(() => {
    if (channel !== "email") return;
    let live = true;
    const t = setTimeout(() => {
      void previewEmailAction({ subject: fields.subject ?? "", title: fields.title ?? "", body: fields.body ?? "", greeting: fields.greeting ?? "", button: fields.button ?? "", footnote: fields.footnote ?? "" })
        .then((r) => { if (!live) return; if (r.ok) { setHtml({ subject: r.subject, html: r.html }); setError(false); } else setError(true); })
        .catch(() => live && setError(true));
    }, 350);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, key]);

  const title = fields.title ?? "";
  const body = fields.body ?? "";
  return (
    <div className="space-y-2 rounded-xl border bg-background p-3" data-preview={channel}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview · {CHANNEL_LABEL[channel]}</p>
      {!enabled && <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">This channel is turned off for this notification, so nothing is sent. The preview shows how it would look.</p>}
      {channel === "inApp" && (
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bell className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{title}</p>
              {body && <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Just now</p>
            </div>
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
          </div>
        </div>
      )}
      {channel === "push" && (
        <div className="mx-auto max-w-sm rounded-2xl border bg-muted/60 p-3 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="flex size-4 items-center justify-center rounded bg-primary text-[9px] font-bold text-primary-foreground">{brand.slice(0, 1).toUpperCase()}</span> {brand} · now</div>
          <p className="mt-1 truncate text-sm font-semibold">{title.slice(0, 120)}</p>
          {body && <p className="line-clamp-3 text-sm text-muted-foreground">{body.slice(0, 300)}</p>}
        </div>
      )}
      {channel === "email" && (
        <div className="space-y-2">
          <p className="truncate text-xs"><span className="text-muted-foreground">Subject: </span><span className="font-medium">{html?.subject ?? ""}</span></p>
          {error ? <p className="text-xs text-destructive">The preview could not be loaded.</p> : <iframe title="Email preview" sandbox="" srcDoc={html?.html ?? ""} className="h-[28rem] w-full rounded-lg border bg-white" />}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{real ? "Example values stand in for the { } parts; real ones are put in when it is sent." : "Example values stand in for the { } parts; real ones are put in when it is sent."}</p>
    </div>
  );
}

// ── Announcements ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
const STATUS_TONE: Record<AnnouncementStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-primary/15 text-primary",
  sending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function Announcements({ announcements: initial, roles, people, canEdit, platformOff }: CenterProps) {
  const [items, setItems] = useState(initial);
  const [status, setStatus] = useState<"all" | AnnouncementStatus>("all");
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<{ mode: "create" | "edit"; source: AnnouncementView | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const roleName = useMemo(() => new Map(roles.map((r) => [r.value, r.label] as const)), [roles]);
  const personName = useMemo(() => new Map(people.map((p) => [p.id, p.label] as const)), [people]);

  const upsert = (a: AnnouncementView) => setItems((xs) => (xs.some((x) => x.id === a.id) ? xs.map((x) => (x.id === a.id ? a : x)) : [a, ...xs]));
  const shown = items.filter((a) => (status === "all" || a.status === status) && (!q.trim() || `${a.title} ${a.body}`.toLowerCase().includes(q.trim().toLowerCase())));
  const counts = (s: AnnouncementStatus) => items.filter((a) => a.status === s).length;

  const audienceLabel = (a: AnnouncementAudience) =>
    a.type === "everyone" ? "Everyone" : a.type === "roles" ? a.roles.map((r) => roleName.get(r) ?? r).join(", ") : a.ids.length <= 2 ? a.ids.map((i) => personName.get(i)?.replace(/ \(.*\)$/, "") ?? "Someone").join(", ") : `${a.ids.length} people`;

  const run = async (id: string, fn: () => Promise<{ ok: true; announcement: AnnouncementView } | { ok: false; error: string }>) => {
    setBusy(id);
    setError(null);
    const res = await fn().catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Something went wrong." }));
    setBusy(null);
    if (res.ok) upsert(res.announcement);
    else setError(res.error);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search announcements" className="pl-9" aria-label="Search announcements" /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={selectClass} aria-label="Status">
          <option value="all">All ({items.length})</option>
          {(["draft", "scheduled", "sent", "failed", "cancelled"] as const).map((s) => <option key={s} value={s}>{ANNOUNCEMENT_STATUS_LABEL[s]} ({counts(s)})</option>)}
        </select>
        {canEdit && <Button type="button" onClick={() => setSheet({ mode: "create", source: null })}><Plus className="size-4" /> New announcement</Button>}
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      {shown.length === 0 && (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Megaphone className="mx-auto mb-2 size-6" />
          {items.length === 0 ? "You haven't written any announcements yet. Write one to tell everyone, a role or chosen people — now or at a time you pick." : "No announcements match."}
        </div>
      )}
      <ul className="space-y-3">
        {shown.map((a) => (
          <li key={a.id} data-announcement={a.id} className="rounded-2xl border border-border/60 bg-card/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">{a.title}<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[a.status]}`}>{ANNOUNCEMENT_STATUS_LABEL[a.status]}</span></p>
                {a.body && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.body}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="size-3.5" /> {audienceLabel(a.audience)}</span>
                  <span className="flex items-center gap-2">{CHANNELS.filter((c) => a.channels[c]).map((c) => { const Icon = ICON[c]; return <span key={c} className="flex items-center gap-1"><Icon className="size-3.5" /> {CHANNEL_LABEL[c]}</span>; })}</span>
                  {a.status === "scheduled" && <span className="flex items-center gap-1"><CalendarClock className="size-3.5" /> Goes out {when(a.scheduledAt)}</span>}
                  {a.status === "sent" && <span>Sent {when(a.sentAt)} to {a.recipients} {a.recipients === 1 ? "person" : "people"}</span>}
                  {a.status === "failed" && <span className="text-destructive">{a.error || "Could not be sent"}</span>}
                </div>
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  {busy === a.id || a.status === "sending" ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : (
                    <>
                      {(a.status === "draft" || a.status === "scheduled" || a.status === "failed") && <Button type="button" size="sm" variant="outline" onClick={() => setSheet({ mode: "edit", source: a })}><Pencil className="size-3.5" /> Edit</Button>}
                      {(a.status === "draft" || a.status === "scheduled" || a.status === "failed") && <Button type="button" size="sm" onClick={() => { if (confirm(`Send "${a.title}" now?`)) void run(a.id, () => sendAnnouncementNowAction(a.id)); }}><Send className="size-3.5" /> Send now</Button>}
                      {a.status === "scheduled" && <Button type="button" size="sm" variant="outline" onClick={() => void run(a.id, () => cancelAnnouncementAction(a.id))}><X className="size-3.5" /> Cancel</Button>}
                      {(a.status === "sent" || a.status === "cancelled") && <Button type="button" size="sm" variant="outline" onClick={() => setSheet({ mode: "create", source: a })}>Use as new</Button>}
                      <Button type="button" size="sm" variant="ghost" aria-label={`Delete ${a.title}`} onClick={() => { if (confirm(`Delete "${a.title}"? What was already delivered stays in Activity.`)) { setBusy(a.id); void deleteAnnouncementAction(a.id).then((r) => { setBusy(null); if (r.ok) setItems((xs) => xs.filter((x) => x.id !== a.id)); else setError(r.error ?? "Could not delete."); }); } }}><Trash2 className="size-3.5" /></Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <AnnouncementSheet state={sheet} roles={roles} people={people} off={platformOff.announcement ?? {}} onClose={() => setSheet(null)} onSaved={(a) => { upsert(a); setSheet(null); setError(null); }} />
    </div>
  );
}

function AnnouncementSheet({ state, roles, people, off, onClose, onSaved }: { state: { mode: "create" | "edit"; source: AnnouncementView | null } | null; roles: CenterProps["roles"]; people: CenterProps["people"]; off: Partial<Record<ChannelKey, false>>; onClose: () => void; onSaved: (a: AnnouncementView) => void }) {
  return (
    <Sheet open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {state && <SheetForm key={`${state.mode}:${state.source?.id ?? "new"}`} state={state} roles={roles} people={people} off={off} onSaved={onSaved} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function SheetForm({ state, roles, people, off, onSaved, onClose }: { state: { mode: "create" | "edit"; source: AnnouncementView | null }; roles: CenterProps["roles"]; people: CenterProps["people"]; off: Partial<Record<ChannelKey, false>>; onSaved: (a: AnnouncementView) => void; onClose: () => void }) {
  const src = state.source;
  const editing = state.mode === "edit" && src;
  const [title, setTitle] = useState(src?.title ?? "");
  const [body, setBody] = useState(src?.body ?? "");
  const [link, setLink] = useState(src?.link ?? "");
  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>(() => { const base = src?.channels ?? { inApp: true, push: true, email: false }; return { inApp: base.inApp && off.inApp !== false, push: base.push && off.push !== false, email: base.email && off.email !== false }; });
  const [audience, setAudience] = useState<AnnouncementAudience>(src?.audience ?? { type: "everyone" });
  const [mode, setMode] = useState<"now" | "schedule" | "draft">(editing && src.status === "scheduled" ? "schedule" : "now");
  const [at, setAt] = useState(editing && src.status === "scheduled" ? toLocalInput(src.scheduledAt) : "");
  const [find, setFind] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const chosen = audience.type === "roles" ? audience.roles : audience.type === "people" ? audience.ids : [];
  const options = audience.type === "roles" ? roles.map((r) => ({ id: r.value, label: r.label })) : people;
  const visible = options.filter((o) => !find.trim() || o.label.toLowerCase().includes(find.trim().toLowerCase()));
  const setChosen = (next: string[]) => setAudience(audience.type === "roles" ? { type: "roles", roles: next } : { type: "people", ids: next });
  const toggle = (id: string) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const minLocal = toLocalInput(new Date(Date.now() + 60_000).toISOString());

  const submit = () =>
    start(async () => {
      setError(null);
      if (mode === "schedule" && !at) return setError("Pick a date and time to send it.");
      const payload = { title, body, link, channels, audience, when: mode, scheduledAt: mode === "schedule" ? new Date(at).toISOString() : null };
      const res = await (editing ? updateAnnouncementAction(src.id, payload) : createAnnouncementAction(payload)).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Could not save." }));
      if (res.ok) onSaved(res.announcement);
      else setError(res.error);
    });

  return (
    <>
      <SheetHeader className="border-b p-5 pr-12">
        <SheetTitle className="text-lg">{editing ? "Edit announcement" : "New announcement"}</SheetTitle>
        <SheetDescription>Write it once. Send it now, or choose a time and it goes out by itself.</SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="space-y-1.5"><Label htmlFor="an-title">Title</Label><Input id="an-title" className="bg-background" value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} placeholder="Office closed on Friday" /></div>
        <div className="space-y-1.5"><Label htmlFor="an-body">Message</Label><Textarea id="an-body" className="bg-background" value={body} maxLength={LIMITS.body} rows={4} onChange={(e) => setBody(e.target.value)} /><p className="text-right text-xs text-muted-foreground">{body.length}/{LIMITS.body}</p></div>
        <div className="space-y-1.5"><Label htmlFor="an-link">Opens (optional page)</Label><Input id="an-link" className="bg-background" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/commandos" /></div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Send through</legend>
          <div className="flex flex-wrap gap-4 text-sm">{CHANNELS.map((c) => { const Icon = ICON[c]; return <label key={c} className={`flex items-center gap-2 ${off[c] === false ? "opacity-50" : ""}`} title={off[c] === false ? `${CHANNEL_LABEL[c]} is turned off by SelfRun for announcements` : undefined}><input type="checkbox" className="size-4 accent-primary" checked={channels[c]} disabled={off[c] === false} onChange={(e) => setChannels({ ...channels, [c]: e.target.checked })} /><Icon className="size-4" /> {CHANNEL_LABEL[c]}{off[c] === false && <span className="text-xs text-muted-foreground">(off)</span>}</label>; })}</div>
          <p className="text-xs text-muted-foreground">People&apos;s own notification settings still apply to push and email.</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Who gets it</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {([["everyone", "Everyone"], ["roles", "People with a role"], ["people", "Specific people"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => { setFind(""); setAudience(k === "everyone" ? { type: "everyone" } : k === "roles" ? { type: "roles", roles: [] } : { type: "people", ids: [] }); }} className={`rounded-full border px-3 py-1 ${audience.type === k ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}>{label}</button>
            ))}
          </div>
          {audience.type !== "everyone" && (
            <div className="space-y-2 rounded-xl border bg-background p-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input value={find} onChange={(e) => setFind(e.target.value)} className="pl-8" placeholder={audience.type === "roles" ? "Search roles" : "Search people by name or email"} aria-label="Search" /></div>
                <Button type="button" size="sm" variant="outline" onClick={() => setChosen([...new Set([...chosen, ...visible.map((o) => o.id)])])}>Select shown</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setChosen([])}>Clear</Button>
              </div>
              <div className="max-h-56 overflow-auto text-sm">
                {visible.map((o) => <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/60"><input type="checkbox" className="size-4 accent-primary" checked={chosen.includes(o.id)} onChange={() => toggle(o.id)} /><span className="truncate">{o.label}</span></label>)}
                {visible.length === 0 && <p className="px-2 py-4 text-center text-muted-foreground">No match.</p>}
              </div>
              <p className="px-1 text-xs text-muted-foreground">{chosen.length} selected</p>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">When</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {([["now", "Send now"], ["schedule", "Schedule"], ["draft", "Save as draft"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-full border px-3 py-1 ${mode === k ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}>{label}</button>
            ))}
          </div>
          {mode === "schedule" && (
            <div className="space-y-1.5">
              <Input type="datetime-local" className="bg-background" value={at} min={minLocal} onChange={(e) => setAt(e.target.value)} aria-label="Send at" />
              <p className="text-xs text-muted-foreground">In your time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). It is sent within a few minutes of this time.</p>
            </div>
          )}
        </fieldset>
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-2 border-t p-4">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={pending} onClick={submit}>{pending ? <Loader2 className="size-4 animate-spin" /> : mode === "now" ? <Send className="size-4" /> : mode === "schedule" ? <CalendarClock className="size-4" /> : null}{mode === "now" ? "Send now" : mode === "schedule" ? "Schedule" : "Save draft"}</Button>
      </div>
    </>
  );
}

// ── Activity ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<LogStatus, string> = { sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", failed: "bg-destructive/15 text-destructive", off: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
const STATUS_LABEL: Record<LogStatus, string> = { sent: "Sent", failed: "Failed", off: "Held back" };

function Activity({ products }: { products: { key: string; name: string }[] }) {
  const [channel, setChannel] = useState<"" | ChannelKey>("");
  const [status, setStatus] = useState<"" | LogStatus>("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const names = useMemo(() => new Map(products.map((p) => [p.key, p.name] as const)), [products]);

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadLogAction({ channel: channel || undefined, status: status || undefined, q: q || undefined, before });
      setRows((r) => (before ? [...r, ...res.entries] : res.entries));
      setNext(res.next);
    } catch {
      setError("Could not load the activity.");
    } finally {
      setLoading(false);
    }
  }, [channel, status, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title" className="pl-9" aria-label="Search activity" /></div>
        <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className={selectClass} aria-label="Channel"><option value="">All channels</option>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={selectClass} aria-label="Status"><option value="">Any status</option>{(["sent", "failed", "off"] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/70">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2">Notification</th><th className="px-3 py-2">To</th><th className="px-3 py-2">Status</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{new Date(r.at).toLocaleString()}</td>
                <td className="px-3 py-2">{CHANNEL_LABEL[r.channel]}</td>
                <td className="px-3 py-2"><span className="block font-medium">{r.title}</span><span className="text-xs text-muted-foreground">{names.get(r.product) ?? r.product} · {eventName(r.event)}</span></td>
                <td className="px-3 py-2 text-xs">{r.recipient}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>{r.detail && <span className="mt-0.5 block text-xs text-muted-foreground">{r.detail}</span>}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Nothing has been sent yet. New activity appears here as notifications go out.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {next && !loading && <Button type="button" variant="outline" onClick={() => void load(next)}>Load more</Button>}
        <p className="text-xs text-muted-foreground">Activity is kept for 60 days.</p>
      </div>
    </div>
  );
}
