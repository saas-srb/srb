"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, History, Loader2, Pencil, Plus, Send, Trash2, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTime } from "@/lib/utils";
import { EVENT_TYPES, eventFields, eventLabel } from "@/lib/platform/events/catalog";
import { ACTION_TYPES, CONDITION_OPS, MAX_ACTIONS_PER_WORKFLOW, MAX_CONDITIONS_PER_WORKFLOW, type WorkflowAction, type WorkflowCondition, type WorkflowInput, type WorkflowRunView, type WorkflowView } from "@/lib/platform/workflows/shared";
import { WORKFLOW_TEMPLATES } from "@/lib/platform/workflows/templates";
import type { WorkflowVersionView } from "@/lib/platform/workflows/versions";
import {
  addTemplateAction,
  automationRunsAction,
  automationVersionsAction,
  restoreAutomationVersionAction,
  deleteAutomationAction,
  saveAutomationAction,
  testAutomationAction,
  toggleAutomationAction,
  type AutomationResult,
} from "@/app/(products)/commandos/(protected)/settings/automations/actions";

const selectClass =
  "h-9 w-full min-w-0 rounded-xl border border-border/50 bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

interface Option {
  value: string;
  label: string;
}

const BLANK: WorkflowInput = { name: "", enabled: true, trigger: "lead.created", conditions: [], actions: [{ type: "notify", target: "role", value: "", title: "", body: "" }] };

function newAction(type: WorkflowAction["type"]): WorkflowAction {
  if (type === "email") return { type: "email", to: "", subject: "", body: "" };
  if (type === "webhook") return { type: "webhook", url: "" };
  if (type === "whatsapp") return { type, to: "", body: "" };
  return { type: "notify", target: "role", value: "", title: "", body: "" };
}

function describe(a: WorkflowAction, roles: Option[], people: { id: string; email: string }[]): string {
  if (a.type === "email") return `Email ${a.to}`;
  if (a.type === "whatsapp") return `WhatsApp ${a.to}`;
  if (a.type === "webhook") {
    try {
      return `Webhook to ${new URL(a.url).host}`;
    } catch {
      return "Webhook";
    }
  }
  const who = a.target === "user" ? (people.find((p) => p.id === a.value)?.email ?? "a person") : (roles.find((r) => r.value === a.value)?.label ?? a.value);
  return `Notify ${who}`;
}

function Editor({
  value,
  editing,
  roles,
  people,
  busy,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  value: WorkflowInput;
  editing: WorkflowView | null;
  roles: Option[];
  people: { id: string; email: string }[];
  busy: boolean;
  error: string | null;
  onChange: (v: WorkflowInput) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const fields = eventFields(value.trigger);
  const tokens = fields.map((f) => `{{${f.key}}}`).join("  ");
  const setCondition = (i: number, patch: Partial<WorkflowCondition>) => onChange({ ...value, conditions: value.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setAction = (i: number, next: WorkflowAction) => onChange({ ...value, actions: value.actions.map((a, j) => (j === i ? next : a)) });

  return (
    <form
      id="automation-form"
      className="space-y-5 rounded-2xl border border-primary/30 bg-primary/5 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h3 className="text-base font-semibold">{editing ? "Edit automation" : "New automation"}</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="automation-name">Name</Label>
          <Input id="automation-name" value={value.name} maxLength={120} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="e.g. Big deal won → tell the founders" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="automation-trigger">When this happens</Label>
          <select id="automation-trigger" className={selectClass} value={value.trigger} onChange={(e) => onChange({ ...value, trigger: e.target.value, conditions: [] })}>
            {EVENT_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Only if (every condition must match)</legend>
        {value.conditions.length === 0 && <p className="text-xs text-muted-foreground">No conditions: runs every time.</p>}
        {value.conditions.map((c, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" data-condition>
            <select aria-label={`Condition ${i + 1} field`} className={selectClass} value={c.field} onChange={(e) => setCondition(i, { field: e.target.value })}>
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <select aria-label={`Condition ${i + 1} comparison`} className={selectClass} value={c.op} onChange={(e) => setCondition(i, { op: e.target.value as WorkflowCondition["op"] })}>
              {CONDITION_OPS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Input aria-label={`Condition ${i + 1} value`} value={c.value} maxLength={200} onChange={(e) => setCondition(i, { value: e.target.value })} placeholder="Value" />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove condition ${i + 1}`} onClick={() => onChange({ ...value, conditions: value.conditions.filter((_, j) => j !== i) })}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {value.conditions.length < MAX_CONDITIONS_PER_WORKFLOW && (
          <Button type="button" variant="outline" size="sm" id="automation-add-condition" onClick={() => onChange({ ...value, conditions: [...value.conditions, { field: fields[0].key, op: "eq", value: "" }] })}>
            <Plus className="size-3.5" /> Add condition
          </Button>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Then do this</legend>
        {value.actions.map((a, i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-background/70 p-3" data-action={a.type}>
            <div className="flex items-center gap-2">
              <select aria-label={`Action ${i + 1} type`} className={selectClass} value={a.type} onChange={(e) => setAction(i, newAction(e.target.value as WorkflowAction["type"]))}>
                {ACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove action ${i + 1}`} disabled={value.actions.length === 1} onClick={() => onChange({ ...value, actions: value.actions.filter((_, j) => j !== i) })}>
                <Trash2 className="size-4" />
              </Button>
            </div>

            {a.type === "notify" && (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select aria-label={`Action ${i + 1} notify who`} className={selectClass} value={a.target} onChange={(e) => setAction(i, { ...a, target: e.target.value === "user" ? "user" : "role", value: "" })}>
                    <option value="role">Everyone with a role</option>
                    <option value="user">One person</option>
                  </select>
                  <select aria-label={`Action ${i + 1} ${a.target === "user" ? "person" : "role"}`} className={selectClass} value={a.value} onChange={(e) => setAction(i, { ...a, value: e.target.value })}>
                    <option value="">{a.target === "user" ? "Choose a person" : "Choose a role"}</option>
                    {(a.target === "user" ? people.map((p) => ({ value: p.id, label: p.email })) : roles).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Input aria-label={`Action ${i + 1} notification title`} value={a.title} maxLength={200} onChange={(e) => setAction(i, { ...a, title: e.target.value })} placeholder="Title, e.g. New lead: {{name}}" />
                <Input aria-label={`Action ${i + 1} notification text`} value={a.body} maxLength={1000} onChange={(e) => setAction(i, { ...a, body: e.target.value })} placeholder="Text (optional)" />
              </>
            )}

            {a.type === "email" && (
              <>
                <Input aria-label={`Action ${i + 1} email to`} value={a.to} maxLength={254} onChange={(e) => setAction(i, { ...a, to: e.target.value })} placeholder="finance@yourcompany.com or {{actorEmail}}" autoCapitalize="none" spellCheck={false} />
                <Input aria-label={`Action ${i + 1} email subject`} value={a.subject} maxLength={200} onChange={(e) => setAction(i, { ...a, subject: e.target.value })} placeholder="Subject" />
                <Textarea aria-label={`Action ${i + 1} email message`} value={a.body} maxLength={4000} rows={3} onChange={(e) => setAction(i, { ...a, body: e.target.value })} placeholder="Message" />
              </>
            )}

            {a.type === "whatsapp" && (
              <>
                <Input aria-label={`Action ${i + 1} phone number`} value={a.to} maxLength={40} onChange={(e) => setAction(i, { ...a, to: e.target.value })} placeholder="+91 98765 43210 or {{phone}}" />
                <Textarea aria-label={`Action ${i + 1} message`} value={a.body} maxLength={1000} rows={3} onChange={(e) => setAction(i, { ...a, body: e.target.value })} placeholder="Message" />
                <p className="text-xs text-muted-foreground">Sent from your own Twilio / WhatsApp Business account — connect it in Settings → Integrations.</p>
              </>
            )}

            {a.type === "webhook" && (
              <>
                <Input aria-label={`Action ${i + 1} webhook URL`} value={a.url} maxLength={2000} onChange={(e) => setAction(i, { ...a, url: e.target.value })} placeholder="https://example.com/hooks/commandos" inputMode="url" autoCapitalize="none" spellCheck={false} />
                <p className="text-xs text-muted-foreground">
                  We POST the event as JSON, signed in the <code className="font-mono">X-Webhook-Signature</code> header (<code className="font-mono">t=timestamp,v1=HMAC-SHA256(secret, &quot;timestamp.body&quot;)</code>). Public https addresses only; redirects aren&apos;t followed.
                </p>
                {editing && (
                  <p className="text-xs break-all text-muted-foreground">
                    Signing secret: <code className="font-mono">{editing.secret}</code>
                  </p>
                )}
              </>
            )}
          </div>
        ))}
        {value.actions.length < MAX_ACTIONS_PER_WORKFLOW && (
          <Button type="button" variant="outline" size="sm" id="automation-add-action" onClick={() => onChange({ ...value, actions: [...value.actions, newAction("notify")] })}>
            <Plus className="size-3.5" /> Add action
          </Button>
        )}
        <p className="text-xs break-words text-muted-foreground">Insert details from the event: {tokens}</p>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" id="automation-save" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} {editing ? "Save changes" : "Create automation"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Settings → Automations: templates, the company's automations, the editor and each one's run history. */
export default function AutomationsManager({ initial, roles, people, max }: { initial: WorkflowView[]; roles: Option[]; people: { id: string; email: string }[]; max: number }) {
  const [workflows, setWorkflows] = useState(initial);
  const [draft, setDraft] = useState<WorkflowInput | null>(null);
  const [editing, setEditing] = useState<WorkflowView | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; runs: WorkflowRunView[]; versions: WorkflowVersionView[] } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [, start] = useTransition();
  const atLimit = workflows.length >= max;

  function run(key: string, fn: () => Promise<AutomationResult>, opts: { form?: boolean; after?: () => void } = {}) {
    setBusy(key);
    setNotice(null);
    setFormError(null);
    start(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          setWorkflows(res.workflows);
          if (res.message) setNotice({ tone: "ok", text: res.message });
          opts.after?.();
        } else if (opts.form) setFormError(res.error);
        else setNotice({ tone: "error", text: res.error });
      } catch {
        const text = "Something went wrong. Please try again.";
        if (opts.form) setFormError(text);
        else setNotice({ tone: "error", text });
      } finally {
        setBusy(null);
      }
    });
  }

  function openEditor(wf: WorkflowView | null) {
    setEditing(wf);
    setFormError(null);
    setDraft(wf ? { name: wf.name, enabled: wf.enabled, trigger: wf.trigger, conditions: wf.conditions, actions: wf.actions } : BLANK);
  }

  function toggleHistory(id: string) {
    if (history?.id === id) return setHistory(null);
    setBusy(`history:${id}`);
    start(async () => {
      try {
        const [runs, versions] = await Promise.all([automationRunsAction(id), automationVersionsAction(id)]);
        setHistory({ id, runs, versions });
      } catch {
        setNotice({ tone: "error", text: "Couldn't load the run history." });
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="automation-templates-title" className="space-y-2">
        <h3 id="automation-templates-title" className="text-sm font-medium">
          Start from a template
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {WORKFLOW_TEMPLATES.map((t) => (
            <li key={t.key} className="flex flex-col gap-2 rounded-xl border bg-background/60 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="self-start" id={`automation-template-${t.key}`} disabled={atLimit || busy !== null} onClick={() => run(`template:${t.key}`, () => addTemplateAction(t.key))}>
                {busy === `template:${t.key}` ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <div aria-live="polite">
        {notice && (
          <p id="automation-notice" role={notice.tone === "error" ? "alert" : "status"} className={cn("rounded-lg px-3 py-2 text-sm break-words", notice.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
            {notice.text}
          </p>
        )}
      </div>

      <section aria-labelledby="automation-list-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="automation-list-title" className="text-sm font-medium">
            Your automations ({workflows.length}/{max})
          </h3>
          {!draft && (
            <Button type="button" size="sm" id="automation-new" disabled={atLimit} onClick={() => openEditor(null)}>
              <Plus className="size-3.5" /> New automation
            </Button>
          )}
        </div>

        {draft && (
          <Editor
            value={draft}
            editing={editing}
            roles={roles}
            people={people}
            busy={busy === "save"}
            error={formError}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => run("save", () => saveAutomationAction(editing?.id ?? null, draft), { form: true, after: () => setDraft(null) })}
          />
        )}

        {workflows.length === 0 && !draft && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No automations yet. Add a template above or create your own.</p>}

        <ul className="space-y-2" id="automation-list">
          {workflows.map((wf) => (
            <li key={wf.id} className="rounded-xl border bg-background/60 p-3" data-automation={wf.id} data-enabled={wf.enabled}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium break-words">
                    <Zap className={cn("size-3.5 shrink-0", wf.enabled ? "text-primary" : "text-muted-foreground")} /> {wf.name}
                  </p>
                  <p className="text-xs break-words text-muted-foreground">
                    When: {eventLabel(wf.trigger)}
                    {wf.conditions.length > 0 && ` · ${wf.conditions.length} condition${wf.conditions.length === 1 ? "" : "s"}`} · Then: {wf.actions.map((a) => describe(a, roles, people)).join(", ")}
                  </p>
                  <p className="flex items-center gap-1 text-xs break-words" data-last-run={wf.lastRun?.status ?? "never"}>
                    {wf.lastRun === null ? (
                      <span className="text-muted-foreground">Hasn&apos;t run yet</span>
                    ) : wf.lastRun.status === "success" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" /> Last run succeeded · {formatDateTime(wf.lastRun.at)}
                      </span>
                    ) : (
                      <span className="inline-flex items-start gap-1 text-destructive">
                        <XCircle className="mt-0.5 size-3 shrink-0" /> Last run failed · {formatDateTime(wf.lastRun.at)}
                        {wf.lastRun.error ? ` · ${wf.lastRun.error}` : ""}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <label className="mr-1 inline-flex cursor-pointer items-center gap-1.5 text-xs">
                    <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={wf.enabled} disabled={busy !== null} aria-label={`${wf.name} enabled`} onChange={(e) => run(`toggle:${wf.id}`, () => toggleAutomationAction(wf.id, e.target.checked))} />
                    {wf.enabled ? "On" : "Off"}
                  </label>
                  <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => run(`test:${wf.id}`, () => testAutomationAction(wf.id))} data-test-automation>
                    {busy === `test:${wf.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send test
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => toggleHistory(wf.id)} aria-expanded={history?.id === wf.id} data-history-automation>
                    <History className="size-3.5" /> History
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => openEditor(wf)} data-edit-automation>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  {confirmDelete === wf.id ? (
                    <Button type="button" variant="destructive" size="sm" disabled={busy !== null} onClick={() => run(`delete:${wf.id}`, () => deleteAutomationAction(wf.id), { after: () => setConfirmDelete(null) })}>
                      Confirm delete
                    </Button>
                  ) : (
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${wf.name}`} disabled={busy !== null} onClick={() => setConfirmDelete(wf.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {history?.id === wf.id && (
                <div className="mt-3 border-t pt-3" data-run-history>
                  <p className="mb-1.5 text-xs font-semibold">Versions</p>
                  <ul className="mb-3 space-y-1.5" data-version-history>
                    {history.versions.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-version={v.version}>
                        <span className="shrink-0 font-medium">v{v.version}{v.current ? " · current" : ""}</span>
                        <span className="shrink-0 text-muted-foreground">{formatDateTime(v.at)}</span>
                        <span className="min-w-0 text-muted-foreground">{v.label}{v.note ? ` (${v.note})` : ""}{v.by ? ` · ${v.by}` : ""} · {v.enabled ? "on" : "off"} · {eventLabel(v.trigger as never)} · {v.conditions} condition{v.conditions === 1 ? "" : "s"}, {v.actions} action{v.actions === 1 ? "" : "s"}</span>
                        {!v.current && (
                          confirmRestore === v.id ? (
                            <Button type="button" size="xs" variant="destructive" disabled={busy !== null} onClick={() => run(`restore:${v.id}`, () => restoreAutomationVersionAction(wf.id, v.id), { after: () => { setConfirmRestore(null); setHistory(null); } })}>Confirm restore v{v.version}</Button>
                          ) : (
                            <Button type="button" size="xs" variant="outline" disabled={busy !== null} onClick={() => setConfirmRestore(v.id)}>Restore this version</Button>
                          )
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mb-1.5 text-xs font-semibold">Runs</p>
                  {history.runs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No runs yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {history.runs.map((r) => (
                        <li key={r.id} className="flex flex-col gap-0.5 text-xs sm:flex-row sm:gap-3" data-run={r.status}>
                          <span className="shrink-0 text-muted-foreground">{formatDateTime(r.at)}</span>
                          <span className={cn("shrink-0 font-medium", r.status === "success" ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
                            {r.status === "success" ? "Succeeded" : "Failed"}
                            {r.test ? " (test)" : ""}
                          </span>
                          <span className="min-w-0 break-words text-muted-foreground">
                            {r.label ? `${r.label} — ` : ""}
                            {r.results.map((x) => x.detail).join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
