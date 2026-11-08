"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, LoaderCircle, Phone, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import AgentPicker from "@/components/products/agentos/AgentPicker";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import CallBriefingPreview from "@/components/products/agentos/calls/CallBriefingPreview";
import ExistingCallCard from "@/components/products/agentos/calls/ExistingCallCard";
import type { ExistingCallInfo } from "@/lib/products/agentos/calls/types";
import { loadCallOptionsAction, requestCallAction, type PlacedCall } from "@/lib/products/agentos/calls/actions";
import type { CallOptions } from "@/lib/products/agentos/calls/options";
import { checkPhoneInput, checkScheduleInput, formatInZone, formatPhone, toZonedLocal } from "@/lib/products/agentos/calls/call-ui";
import { describeFailure, overrideReasonProblem, OVERRIDE_REASON_MAX, type FailureAdvice } from "@/lib/products/agentos/calls/guard-messages";
import { CONTEXT_NOTES_MAX } from "@/lib/products/agentos/calls/context";
import type { AgentOption } from "@/lib/products/agentos/picker-types";

/**
 * The one "Call with AI" button every product uses. It opens a dialog: pick a voice agent (only agents set up for the chosen
 * purpose), confirm the number, then call now or schedule. The server runs every guard again; this component only makes the answers
 * readable. Needs no props from AgentOS: it loads the agents and calling rules itself, and explains what is missing when calling
 * isn't possible for this person.
 *
 *   <CallWithAI target={{ product: "dealflow-ai", entityType: "lead", entityId: lead.id, label: lead.name }} phone={lead.phone} defaultPurpose="lead_followup" />
 */

export interface CallWithAIProps {
  /** The record this call is about; shown on the call and written back to its timeline. */
  target: { product: string; entityType: string; entityId: string; label: string };
  /** Pre-filled number (the person can edit it and must confirm it). */
  phone?: string;
  /** Values for the purpose's variables (for example role_title). Only the variables the purpose declares are used. */
  context?: Record<string, string>;
  /** A purpose key from AgentOS call purposes. Used when an available agent supports it. */
  defaultPurpose?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "icon";
  size?: "default" | "sm" | "lg";
  /** Button text. Default "Call with AI". */
  label?: string;
  className?: string;
  /** Called once when the call is placed or scheduled. */
  onPlaced?: (call: PlacedCall) => void;
  /** Pre-filled "Notes for the agent" (the person can edit or clear it). Applied each time the dialog opens. */
  initialNotes?: string;
  /**
   * Offers an opt-in "Share a short summary" checkbox. Only when the person ticks it is the loader called; the text it returns is added
   * to the notes box, where it can be edited or removed before anything is sent. Nothing is shared without the tick.
   */
  contextSummaryLoader?: () => Promise<{ ok: true; summary: string } | { ok: false; error: string }>;
  /** Label for that checkbox. */
  contextSummaryLabel?: string;
}

const newKey = () => `ui-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`}`;

function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor?: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p role="alert" className="text-[11px] text-destructive">{error}</p> : hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function CallWithAI({ target, phone, context, defaultPurpose, variant = "default", size = "default", label = "Call with AI", className, onPlaced, initialNotes, contextSummaryLoader, contextSummaryLabel = "Share a short summary with the agent" }: CallWithAIProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CallOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [purposeSel, setPurposeSel] = useState("");
  const [agentSel, setAgentSel] = useState("");
  const [phoneText, setPhoneText] = useState(phone ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [shareSummary, setShareSummary] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const addedSummary = useRef("");
  const [briefingKeys, setBriefingKeys] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [overrideShown, setOverrideShown] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const key = useRef(newKey());
  const [advice, setAdvice] = useState<FailureAdvice | null>(null);
  const [existing, setExisting] = useState<ExistingCallInfo | null>(null);
  const [plainError, setPlainError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedCall | null>(null);

  const reset = () => {
    key.current = newKey();
    setPurposeSel("");
    setAgentSel("");
    setPhoneText(phone ?? "");
    setConfirmed(false);
    setMode("now");
    setWhen("");
    setNotes(initialNotes ?? "");
    setShareSummary(false);
    setSummaryBusy(false);
    setSummaryError(null);
    addedSummary.current = "";
    setBriefingKeys(null);
    setReason("");
    setOverrideShown(false);
    setAdvice(null);
    setExisting(null);
    setPlainError(null);
    setPlaced(null);
    setSubmitting(false);
    inFlight.current = false;
  };

  const load = () => {
    setLoading(true);
    setLoadError(null);
    loadCallOptionsAction()
      .then((r) => {
        if (!r.ok) return void setLoadError(r.error);
        setOptions(r.options);
      })
      .catch(() => setLoadError("Couldn't load the calling options. Check your connection and try again."))
      .finally(() => setLoading(false));
  };

  const onOpenChange = (next: boolean) => {
    if (next) {
      reset();
      setOptions(null);
      load();
    }
    setOpen(next);
  };

  // The agents that can take the chosen purpose.
  const readyAgents = useMemo(() => (options?.agents ?? []).filter((a) => a.ready), [options]);
  const purposeChoices = useMemo(() => {
    if (!options) return [];
    const supported = new Set(readyAgents.flatMap((a) => a.purposes));
    return options.purposes.filter((p) => supported.has(p.key));
  }, [options, readyAgents]);
  // The chosen purpose, else the product's default when an agent supports it, else the first one available. Derived, never copied into state.
  const purpose = purposeChoices.some((p) => p.key === purposeSel) ? purposeSel : (purposeChoices.find((p) => p.key === defaultPurpose) ?? purposeChoices[0])?.key ?? "";
  const agentsForPurpose = useMemo(() => readyAgents.filter((a) => a.purposes.includes(purpose)), [readyAgents, purpose]);
  // A single matching agent is chosen for the person.
  const agentId = agentsForPurpose.some((a) => a.id === agentSel) ? agentSel : agentsForPurpose.length === 1 ? agentsForPurpose[0].id : "";

  const agent = agentsForPurpose.find((a) => a.id === agentId) ?? null;
  const pickerAgents: AgentOption[] = agentsForPurpose.map((a) => ({ id: a.id, name: a.name, icon: a.icon, color: a.color, avatarUrl: a.avatarUrl, kind: "voice", category: a.category, description: a.description }));
  const purposeInfo = options?.purposes.find((p) => p.key === purpose) ?? null;

  const tz = options?.timeZone ?? null;
  const phoneCheck = checkPhoneInput(phoneText, options?.allowedCodes ?? []);
  const schedule = mode === "later" && tz ? checkScheduleInput(when, tz) : null;
  const blocked = !options || options.blockers.length > 0;
  const overrideProblem = overrideShown ? overrideReasonProblem(reason) : null;

  const problems: string[] = [];
  if (!purpose) problems.push("Choose what the call is for.");
  if (!agentId) problems.push("Pick a voice agent.");
  if (!phoneCheck.e164) problems.push(phoneText.trim() ? "Fix the phone number." : "Enter the phone number.");
  else if (!confirmed) problems.push("Confirm the number is correct.");
  if (mode === "later" && schedule && !schedule.ok) problems.push(schedule.error);
  if (overrideProblem) problems.push(overrideProblem);

  const toggleSummary = async (on: boolean) => {
    setSummaryError(null);
    if (!on) {
      setShareSummary(false);
      const added = addedSummary.current;
      if (added) setNotes((n) => n.replace(added, "").replace(/\s{2,}/g, " ").trim());
      addedSummary.current = "";
      return;
    }
    if (!contextSummaryLoader) return;
    setSummaryBusy(true);
    try {
      const r = await contextSummaryLoader();
      if (!r.ok) return void setSummaryError(r.error);
      if (!r.summary) return void setSummaryError("There is nothing in the chat to summarise yet.");
      const room = CONTEXT_NOTES_MAX - notes.length - 1;
      const text = r.summary.slice(0, Math.max(room, 0)).trimEnd();
      if (text.length < 20) return void setSummaryError("The notes box is full. Clear some text first, then tick this again.");
      addedSummary.current = text;
      setNotes((n) => `${n} ${text}`.trim());
      setShareSummary(true);
    } catch {
      setSummaryError("Couldn't prepare the summary. Try again.");
    } finally {
      setSummaryBusy(false);
    }
  };

  const submit = async () => {
    if (inFlight.current || blocked || problems.length || !phoneCheck.e164) return;
    inFlight.current = true;
    setSubmitting(true);
    setAdvice(null);
    setExisting(null);
    setPlainError(null);
    const noteText = notes.trim();
    const ctx: Record<string, string> = { ...(context ?? {}) };
    if (!ctx.contact_name && target.label) ctx.contact_name = target.label;
    if (noteText) ctx.notes = [ctx.notes, noteText].filter(Boolean).join(" ").slice(0, CONTEXT_NOTES_MAX);
    try {
      const res = await requestCallAction({
        agentId, purpose, phone: phoneCheck.e164, target, context: ctx,
        scheduleAt: mode === "later" && schedule?.ok ? schedule.at.toISOString() : null,
        overrideReason: overrideShown && reason.trim() ? reason.trim() : undefined,
        idempotencyKey: key.current,
        briefingSelection: purposeInfo?.hasBriefing ? briefingKeys : null,
      });
      if (!res.ok) {
        // A refusal created nothing (or a failed attempt a person may redo): the next try is a fresh request.
        key.current = newKey();
        if (res.failure) {
          const a = describeFailure(res.failure, { isManager: options?.isManager ?? false, agentId });
          setAdvice(a);
          setExisting(res.failure.existing ?? null);
          if (a.canOverride) setOverrideShown(true);
        } else setPlainError(res.error);
        return;
      }
      // A repeated request returns the call that already failed; show that as a failure instead of a success.
      if (res.call.status === "failed") {
        key.current = newKey();
        setPlainError("The call couldn't be started. Open Calls to see why, then try again.");
        return;
      }
      setPlaced(res.call);
      onPlaced?.(res.call);
    } catch {
      // Unknown outcome (network): keep the same key so a retry can't place a second call.
      setPlainError("We couldn't confirm whether the call was placed. Press the button again - it is safe, it won't call twice.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const trigger =
    variant === "icon" ? (
      <Button type="button" variant="outline" size="icon" aria-label={label} title={label} className={className}><PhoneCall className="size-4" /></Button>
    ) : (
      <Button type="button" variant={variant} size={size} className={className}><PhoneCall className="size-4" />{label}</Button>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="p-5 pb-2">
          <DialogTitle className="flex items-center gap-2"><Phone className="size-4 text-primary" />Call {target.label || "this contact"} with AI</DialogTitle>
          <DialogDescription>A voice agent will phone this number. Every call is checked against your calling rules and logged.</DialogDescription>
        </DialogHeader>

        {placed ? (
          <div className="space-y-4 px-5 pb-5">
            <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">{placed.scheduledFor ? "Call scheduled" : "Calling now"}</p>
                <p className="mt-0.5 text-xs">
                  {placed.scheduledFor
                    ? `${agent?.name ?? "The agent"} will call ${target.label || "them"} on ${formatInZone(placed.scheduledFor, tz)}. You can cancel or move it from Calls > Upcoming.`
                    : `${agent?.name ?? "The agent"} is dialing ${target.label || "the number"}. The result and what was collected are saved to the call and written back to the record.`}
                </p>
              </div>
            </div>
            <DialogFooter className="flex-row justify-end gap-2 p-0">
              {!placed.scheduledFor && (
                <Link href={`/agentos/calls/${placed.id}/live`} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"><ExternalLink className="size-3.5" />Watch live</Link>
              )}
              <Link href={`/agentos/calls/${placed.id}`} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"><ExternalLink className="size-3.5" />View call</Link>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : loading || (!options && !loadError) ? (
          <p className="flex items-center gap-2 px-5 pb-8 pt-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading your agents and calling rules…</p>
        ) : loadError ? (
          <div className="space-y-3 px-5 pb-5">
            <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-900 dark:text-rose-200">{loadError}</div>
            <DialogFooter className="flex-row justify-end gap-2 p-0">
              <Button type="button" variant="outline" onClick={load}>Try again</Button>
            </DialogFooter>
          </div>
        ) : options ? (
          <form
            className="space-y-4 px-5 pb-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {options.blockers.length > 0 && (
              <div role="alert" className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" />Calling isn&apos;t available yet</p>
                <ul className="space-y-1.5 text-xs">
                  {options.blockers.map((b) => (
                    <li key={b.code}>
                      {b.message}{" "}
                      {b.link && <Link href={b.link.href} target="_blank" className="font-semibold underline">{b.link.label}</Link>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Field label="What is the call for?" htmlFor="cw-purpose" hint={purposeInfo?.description} error={purposeChoices.length === 0 && !blocked ? "No agent is set up for any call purpose yet." : null}>
              <OptionSelect id="cw-purpose" value={purpose} options={purposeChoices.map((p) => ({ value: p.key, label: p.label }))} placeholder="Choose a purpose" disabled={blocked || submitting} onChange={setPurposeSel} />
            </Field>

            <Field
              label="Voice agent"
              htmlFor="cw-agent"
              hint={purpose && agentsForPurpose.length === 0 ? undefined : "Only agents set up for this kind of call are listed."}
              error={purpose && agentsForPurpose.length === 0 && !blocked ? "No ready agent supports this purpose. Ask an editor to add the purpose to a voice agent." : null}
            >
              <AgentPicker id="cw-agent" agents={pickerAgents} value={agentId} onChange={setAgentSel} placeholder="Choose a voice agent" disabled={blocked || submitting || agentsForPurpose.length === 0} />
            </Field>
            {agent && (
              <div className="flex items-start gap-3 rounded-2xl border border-border/50 bg-muted/30 p-3">
                <BotAvatar icon={agent.icon} color={agent.color} imageUrl={agent.avatarUrl} size="md" />
                <div className="min-w-0 text-xs">
                  <p className="truncate text-sm font-semibold text-foreground">{agent.displayName || agent.name}</p>
                  {(agent.jobTitle || agent.displayName) && <p className="text-muted-foreground">{[agent.displayName ? agent.name : "", agent.jobTitle].filter(Boolean).join(" · ")}</p>}
                  {agent.description && <p className="mt-1 line-clamp-2 text-muted-foreground">{agent.description}</p>}
                </div>
              </div>
            )}

            <Field
              label="Phone number"
              htmlFor="cw-phone"
              hint={options.allowedCodes.length ? `Include the country code. You may call numbers starting with ${options.allowedCodes.join(", ")}.` : "Include the country code."}
              error={phoneText.trim() ? phoneCheck.error : null}
            >
              <Input id="cw-phone" type="tel" inputMode="tel" autoComplete="off" value={phoneText} disabled={blocked || submitting} placeholder={options.allowedCodes[0] ?? "+"} onChange={(e) => { setPhoneText(e.target.value); setConfirmed(false); }} />
            </Field>
            {phoneCheck.e164 && (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs">
                <input type="checkbox" className="mt-0.5 size-3.5 accent-primary" checked={confirmed} disabled={blocked || submitting} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>
                  I confirm <strong className="font-semibold text-foreground">{formatPhone(phoneCheck.e164, options.allowedCodes)}</strong> is the right number for {target.label || "this contact"}
                  {phoneCheck.prefixed ? ` (country code ${options.allowedCodes[0]} added)` : ""}.
                </span>
              </label>
            )}

            {purposeInfo?.hasNotes && (
              <Field label="Notes for the agent (optional)" htmlFor="cw-notes" hint={`Anything the agent should know for this call. ${notes.length} / ${CONTEXT_NOTES_MAX}`}>
                <Textarea id="cw-notes" rows={initialNotes || contextSummaryLoader ? 4 : 2} maxLength={CONTEXT_NOTES_MAX} value={notes} disabled={blocked || submitting} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            )}
            {purposeInfo?.hasNotes && contextSummaryLoader && (
              <div className="space-y-1">
                <label className="flex cursor-pointer items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-0.5 size-3.5 accent-primary" checked={shareSummary} disabled={blocked || submitting || summaryBusy} onChange={(e) => void toggleSummary(e.target.checked)} />
                  <span>{contextSummaryLabel}<span className="block text-[11px] text-muted-foreground">Adds the last few messages, shortened, to the notes above so you can read and edit them. Attachments are never included.</span></span>
                </label>
                {summaryBusy && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Preparing the summary…</p>}
                {summaryError && <p role="alert" className="text-[11px] text-destructive">{summaryError}</p>}
              </div>
            )}

            {purposeInfo?.hasBriefing && !blocked && purpose && (
              <CallBriefingPreview target={target} purpose={purpose} disabled={submitting} onSelection={setBriefingKeys} />
            )}

            <div className="space-y-2">
              <div className="inline-flex rounded-xl border border-border/60 bg-muted/30 p-0.5" role="group" aria-label="When to call">
                {(["now", "later"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    disabled={blocked || submitting}
                    onClick={() => { setMode(m); if (m === "later" && !when && tz) setWhen(toZonedLocal(new Date(Date.now() + 60 * 60_000), tz)); }}
                    className={cn("rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-colors", mode === m ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {m === "now" ? "Call now" : "Schedule"}
                  </button>
                ))}
              </div>
              {mode === "later" && tz && (
                <Field
                  label={`Date and time (${tz})`}
                  htmlFor="cw-when"
                  hint={`Calling hours are ${options.window.start} to ${options.window.end} in ${tz}. Calls are placed once, at this time.`}
                  error={schedule && !schedule.ok && when ? schedule.error : null}
                >
                  <Input id="cw-when" type="datetime-local" value={when} min={toZonedLocal(new Date(), tz)} disabled={blocked || submitting} onChange={(e) => setWhen(e.target.value)} />
                </Field>
              )}
            </div>

            {overrideShown && (
              <Field label="Reason for calling outside the calling hours" htmlFor="cw-override" hint="Only calls managers can do this. The reason is saved with the call." error={reason && overrideProblem ? overrideProblem : null}>
                <Textarea id="cw-override" rows={2} maxLength={OVERRIDE_REASON_MAX} value={reason} disabled={submitting} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}

            {options.testNumberMasked && (
              <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />Test mode: this call will go to {options.testNumberMasked} instead of {target.label ? `${target.label}'s` : "the contact's"} number.
              </p>
            )}

            {options.recordingNotice && <p className="text-[11px] text-muted-foreground">Your workspace tells the person that the call may be recorded. The agent is an AI and says so if asked.</p>}

            {existing && <ExistingCallCard call={existing} onGone={() => { setExisting(null); setAdvice(null); key.current = newKey(); }} />}

            {advice && !existing && (
              <div role="alert" className="space-y-1 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-900 dark:text-rose-200">
                <p className="font-semibold">{advice.title}</p>
                <p className="text-xs">{advice.message}</p>
                {advice.hint && <p className="text-xs opacity-90">{advice.hint}</p>}
                {advice.link && <Link href={advice.link.href} target="_blank" className="inline-block text-xs font-semibold underline">{advice.link.label}</Link>}
              </div>
            )}
            {plainError && <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-900 dark:text-rose-200">{plainError}</div>}

            <DialogFooter className="flex-row items-center justify-between gap-2 p-0">
              <p className="min-w-0 flex-1 text-[11px] text-muted-foreground" aria-live="polite">{!blocked && problems.length > 0 ? problems[0] : ""}</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
                <Button type="submit" disabled={blocked || submitting || problems.length > 0}>
                  {submitting ? <LoaderCircle className="size-4 animate-spin" /> : mode === "later" ? <CalendarClock className="size-4" /> : <PhoneCall className="size-4" />}
                  {mode === "later" ? "Schedule call" : "Call now"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
