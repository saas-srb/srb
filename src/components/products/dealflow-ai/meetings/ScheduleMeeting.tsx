"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, CalendarClock, CheckCircle2, ClipboardPaste, Copy, Link2, Loader2, Plus, Search, Settings2, Trash2, UserPlus, Users, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import type { AgentOption } from "@/lib/products/agentos/picker-types";
import type { StaffOption, TargetOption } from "@/lib/dealflow-ai/meetings/service";
import { DEFAULT_AGENT_RUNTIME, type AgentRuntimeSettings, type MeetingTarget, type MeetingView } from "@/lib/dealflow-ai/meetings/types";
import { parseGuestList, utcToZoned, zonedToUtc, type GuestDraft } from "@/lib/dealflow-ai/meetings/ui";
import { PersonAvatar } from "./ParticipantStack";
import { cn } from "@/lib/utils";

const DURATIONS = [15, 30, 45, 60, 90, 120];
const AGENTOS_NEW_VOICE = "/agentos/bots/new?kind=voice";

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}
function allZones(current: string): string[] {
  try {
    const z = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    return z.includes(current) ? z : [current, ...z];
  } catch {
    return [current];
  }
}

export interface CreatedResult {
  meeting: MeetingView;
  guestLinks: { participantId: string; name: string; url: string }[];
  invites: { participantId: string; name: string; state: string; error?: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  staff: StaffOption[];
  agents: AgentOption[];
  me: { id: string; name: string };
  /** Edit mode: the details of an existing meeting (the roster is managed on the meeting's page). */
  meeting?: MeetingView;
  prefillTarget?: MeetingTarget | null;
  onCreated: (r: CreatedResult) => void;
  onUpdated: (m: MeetingView) => void;
}

const Section = ({ icon: Icon, title, hint, children }: { icon: React.ComponentType<{ className?: string }>; title: string; hint?: string; children: React.ReactNode }) => (
  <section className="space-y-3 rounded-xl border border-border/60 bg-card/50 p-4">
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-primary" />{title}</h3>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
    {children}
  </section>
);

const Check = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex cursor-pointer items-start gap-2.5 text-sm">
    <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span><span className="font-medium">{label}</span>{hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}</span>
  </label>
);

export default function ScheduleMeeting({ open, onClose, staff, agents, me, meeting, prefillTarget, onCreated, onUpdated }: Props) {
  const editing = !!meeting;
  const zone0 = meeting?.timezone ?? browserZone();
  const init = meeting ? utcToZoned(meeting.scheduledAt, meeting.timezone) : { date: "", time: "" };
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [agendaDesc, setAgendaDesc] = useState(meeting?.agenda?.description ?? "");
  const [agentGoal, setAgentGoal] = useState(meeting?.agenda?.agentGoal ?? "");
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [timezone, setTimezone] = useState(zone0);
  const [duration, setDuration] = useState(meeting?.durationMinutes ?? 30);
  const [waitingRoom, setWaitingRoom] = useState(meeting?.waitingRoom ?? false);
  const [sendInvites, setSendInvites] = useState(true);
  const [settings, setSettings] = useState<AgentRuntimeSettings>(meeting?.agentSettings ?? DEFAULT_AGENT_RUNTIME);
  const [target, setTarget] = useState<MeetingTarget | null>(meeting?.target ?? prefillTarget ?? null);
  const [staffPick, setStaffPick] = useState<Record<string, "host" | "participant">>({ [me.id]: "host" });
  const [staffQ, setStaffQ] = useState("");
  const [guests, setGuests] = useState<GuestDraft[]>([{ name: "", email: "", phone: "", company: "" }]);
  const [paste, setPaste] = useState("");
  const whenRef = useRef<HTMLDivElement>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [agentPick, setAgentPick] = useState<Record<string, string>>({});
  const [targetQ, setTargetQ] = useState("");
  const [targets, setTargets] = useState<TargetOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const zones = useMemo(() => allZones(timezone), [timezone]);
  const minDate = useMemo(() => utcToZoned(new Date().toISOString(), timezone).date, [timezone]);

  const staffShown = useMemo(() => {
    const q = staffQ.trim().toLowerCase();
    return staff.filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [staff, staffQ]);

  if (!open) return null;

  const setGuest = (i: number, patch: Partial<GuestDraft>) => setGuests((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addPasted = () => {
    const parsed = parseGuestList(paste);
    if (!parsed.length) return toast.error("Nothing to add. Put one person per line: name, email, phone, company.");
    setGuests((g) => [...g.filter((x) => x.name || x.email), ...parsed]);
    setPaste("");
    setShowPaste(false);
    toast.success(`${parsed.length} ${parsed.length === 1 ? "guest" : "guests"} added`);
  };

  const searchTargets = async (q: string) => {
    setTargetQ(q);
    if (q.trim().length < 2) return setTargets([]);
    try {
      const r = await fetch(`/api/dealflow-ai/meetings/directory?kind=targets&q=${encodeURIComponent(q)}`).then((x) => x.json());
      setTargets(r.targets ?? []);
    } catch {
      setTargets([]);
    }
  };

  const submit = async () => {
    setError("");
    // What is on screen is what gets saved: autofill and form-filler tools can change a field without React noticing.
    const read = (key: string, fallback: string) => whenRef.current?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-f="${key}"]`)?.value ?? fallback;
    const titleV = read("title", title);
    const agendaV = read("agenda", agendaDesc);
    const goalV = read("goal", agentGoal);
    const dateV = read("date", date);
    const timeV = read("time", time);
    const zoneV = read("timezone", timezone);
    const durationV = Number(read("duration", String(duration))) || duration;
    const when = zonedToUtc(dateV, timeV, zoneV);
    if (!titleV.trim()) return setError("The title box is empty. Type a meeting title above and try again.");
    if (!when) return setError("Pick a date and time.");
    const agenda = agendaV.trim() || goalV.trim() ? { title: titleV.trim(), description: agendaV.trim(), agentGoal: goalV.trim() } : null;
    const common = { title: titleV.trim(), agenda, scheduledAt: when.toISOString(), durationMinutes: durationV, timezone: zoneV, waitingRoom, agentSettings: settings, target };
    setBusy(true);
    try {
      if (editing) {
        const res = await fetch(`/api/dealflow-ai/meetings/${meeting!.roomId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...common, notify: sendInvites }) }).then((r) => r.json());
        if (!res.ok) throw new Error(res.error);
        toast.success("Meeting updated");
        onUpdated(res.meeting);
        return;
      }
      const people = [
        ...Object.entries(staffPick).map(([refId, role]) => ({ kind: "internal", refId, role })),
        ...guests.filter((g) => g.name.trim() || g.email.trim() || g.phone.trim()).map((g) => ({ kind: "external", ...g })),
        ...Object.entries(agentPick).map(([refId, aliases]) => ({ kind: "agent", refId, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean) })),
      ];
      const res = await fetch("/api/dealflow-ai/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...common, participants: people, sendInvites }) }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error);
      onCreated(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs" role="dialog" aria-modal="true" aria-label={editing ? "Edit meeting" : "Schedule a meeting"}>
      <div className="flex h-full w-full max-w-3xl flex-col bg-background shadow-2xl">
        <header className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{editing ? "Edit meeting" : "Schedule a meeting"}</h2>
            <p className="text-xs text-muted-foreground">{editing ? "Change the time and details. People are managed on the meeting's page." : "Invite your team, guests and AI agents. Guests get a personal link; nobody needs an account."}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div ref={whenRef}>
          <Section icon={CalendarClock} title="When and what">
            <Input placeholder="Meeting title, for example Project kickoff with Acme" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus autoComplete="off" data-f="title" />
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="space-y-1 text-xs font-medium sm:col-span-1">Date<Input type="date" data-f="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="space-y-1 text-xs font-medium">Time<Input type="time" data-f="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
              <label className="space-y-1 text-xs font-medium">Duration
                <select data-f="duration" className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {[...new Set([...DURATIONS, duration])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d} min</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium">Time zone
                <select data-f="timezone" className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                </select>
              </label>
            </div>
            <Textarea placeholder="Agenda: what this meeting is for (shown in the invitation)" value={agendaDesc} data-f="agenda" autoComplete="off" onChange={(e) => setAgendaDesc(e.target.value)} rows={3} maxLength={4000} />
            <Textarea placeholder="Goal for the AI agents: what they should help with in this meeting (only agents see this)" value={agentGoal} data-f="goal" autoComplete="off" onChange={(e) => setAgentGoal(e.target.value)} rows={2} maxLength={2000} />
          </Section>
          </div>

          {!editing && (
            <Section icon={Users} title="Your team" hint="Colleagues who join from DealFlow. The first host starts the meeting.">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search your team" value={staffQ} onChange={(e) => setStaffQ(e.target.value)} /></div>
              <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {staffShown.map((s) => {
                  const role = staffPick[s.id];
                  return (
                    <div key={s.id} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm", role ? "border-primary/40 bg-primary/5" : "border-border/60")}>
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setStaffPick((p) => { const n = { ...p }; if (n[s.id]) delete n[s.id]; else n[s.id] = "participant"; return n; })}>
                        <PersonAvatar name={s.name} tone="staff" size="sm" />
                        <span className="min-w-0"><span className="block truncate font-medium">{s.name}{s.id === me.id ? " (you)" : ""}</span><span className="block truncate text-[11px] text-muted-foreground">{s.email}</span></span>
                      </button>
                      {role ? <button type="button" className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", role === "host" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")} onClick={() => setStaffPick((p) => ({ ...p, [s.id]: role === "host" ? "participant" : "host" }))} title="Hosts can start, edit and manage the meeting">{role === "host" ? "Host" : "Make host"}</button> : null}
                    </div>
                  );
                })}
                {staffShown.length === 0 ? <p className="py-2 text-xs text-muted-foreground">No one matches.</p> : null}
              </div>
            </Section>
          )}

          {!editing && (
            <Section icon={UserPlus} title="Guests" hint="People outside your company. Each gets a personal join link by email.">
              <div className="space-y-2">
                {guests.map((g, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1.2fr_1.4fr_1fr_1fr_auto]">
                    <Input placeholder="Name" value={g.name} onChange={(e) => setGuest(i, { name: e.target.value })} maxLength={120} />
                    <Input placeholder="Email" type="email" value={g.email} onChange={(e) => setGuest(i, { email: e.target.value })} />
                    <Input placeholder="Phone +91…" value={g.phone} onChange={(e) => setGuest(i, { phone: e.target.value })} />
                    <Input placeholder="Company" value={g.company} onChange={(e) => setGuest(i, { company: e.target.value })} />
                    <Button variant="ghost" size="icon" onClick={() => setGuests((x) => x.filter((_, j) => j !== i))} aria-label="Remove guest"><Trash2 className="size-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setGuests((g) => [...g, { name: "", email: "", phone: "", company: "" }])}><Plus className="size-3.5" />Add guest</Button>
                <Button variant="outline" size="sm" onClick={() => setShowPaste((v) => !v)}><ClipboardPaste className="size-3.5" />Paste a list</Button>
              </div>
              {showPaste && (
                <div className="space-y-2 rounded-lg border border-dashed p-3">
                  <Textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"One person per line:\nAsha Rao, asha@acme.com, +919876543210, Acme\nRavi Kumar <ravi@beta.in>\nmeera@gamma.co"} />
                  <Button size="sm" onClick={addPasted}>Add to guests</Button>
                </div>
              )}
            </Section>
          )}

          {!editing && (
            <Section icon={Bot} title="AI agents" hint="AgentOS voice agents. They only speak when someone addresses them by name; add nicknames below.">
              {agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">You have no voice agents yet. <a className="font-medium text-primary underline-offset-2 hover:underline" href={AGENTOS_NEW_VOICE}>Create one in AgentOS</a>.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {agents.map((a) => {
                    const picked = a.id in agentPick;
                    return (
                      <div key={a.id} className={cn("rounded-xl border p-2.5", picked ? "border-primary/40 bg-primary/5" : "border-border/60")}>
                        <button type="button" className="flex w-full items-center gap-2.5 text-left" onClick={() => setAgentPick((p) => { const n = { ...p }; if (a.id in n) delete n[a.id]; else n[a.id] = ""; return n; })}>
                          <BotAvatar icon={a.icon} color={a.color} imageUrl={a.avatarUrl} size="lg" />
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{a.name}</span><span className="line-clamp-2 text-xs text-muted-foreground">{a.category || a.description || "Voice agent"}</span></span>
                          {picked ? <CheckCircle2 className="size-5 text-primary" /> : null}
                        </button>
                        {picked && <Input className="mt-2 h-8 text-xs" placeholder={`Also answers to… (comma separated, e.g. ${a.name.split(" ")[0]}ji)`} value={agentPick[a.id]} onChange={(e) => setAgentPick((p) => ({ ...p, [a.id]: e.target.value }))} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          )}

          <Section icon={Link2} title="About a lead or applicant" hint="Optional. The agents are briefed on this person and the meeting's outcome is added to their timeline.">
            {target ? (
              <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm"><span><span className="font-medium">{target.label}</span> <span className="text-xs text-muted-foreground">· {target.entityType}</span></span><Button variant="ghost" size="sm" onClick={() => setTarget(null)}>Remove</Button></div>
            ) : (
              <div className="space-y-2">
                <Input placeholder="Search leads and applicants by name, email or phone" value={targetQ} onChange={(e) => void searchTargets(e.target.value)} />
                {targets.length > 0 && (
                  <ul className="max-h-40 divide-y overflow-y-auto rounded-lg border">
                    {targets.map((t) => <li key={`${t.entityType}${t.entityId}`}><button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60" onClick={() => { setTarget({ product: t.product, entityType: t.entityType, entityId: t.entityId, label: t.label }); setTargets([]); setTargetQ(""); }}><span className="font-medium">{t.label}</span><span className="text-xs text-muted-foreground">{t.detail}</span></button></li>)}
                  </ul>
                )}
              </div>
            )}
          </Section>

          <Section icon={Settings2} title="Room and agent behaviour">
            <Check checked={waitingRoom} onChange={setWaitingRoom} label="Waiting room" hint="Guests wait until a host lets them in." />
            <Check checked={settings.allowBargeIn} onChange={(v) => setSettings({ ...settings, allowBargeIn: v })} label="Agents stop when a person starts talking" />
            <Check checked={settings.useLeadBriefing} onChange={(v) => setSettings({ ...settings, useLeadBriefing: v })} label="Brief agents on the linked lead or applicant" />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium">Follow-up window (seconds)<Input type="number" min={0} max={120} value={settings.followUpWindowSecs} onChange={(e) => setSettings({ ...settings, followUpWindowSecs: Number(e.target.value) })} /><span className="block font-normal text-muted-foreground">How long after an answer the same person can continue without repeating the agent&apos;s name.</span></label>
              <label className="space-y-1 text-xs font-medium">Longest answer (seconds)<Input type="number" min={5} max={120} value={settings.maxAnswerSecs} onChange={(e) => setSettings({ ...settings, maxAnswerSecs: Number(e.target.value) })} /><span className="block font-normal text-muted-foreground">Longer answers are cut at a sentence and the agent offers to continue.</span></label>
            </div>
          </Section>
        </div>

        <footer className="space-y-3 border-t bg-background px-5 py-4">
          {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Check checked={sendInvites} onChange={setSendInvites} label={editing ? "Email updated invitations if the time changed" : "Email invitations with a calendar file"} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={() => void submit()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}{editing ? "Save changes" : "Schedule meeting"}</Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Shown once after scheduling: the personal links (only their hashes are stored) and how each invitation went. */
export function GuestLinksDialog({ result, onClose }: { result: CreatedResult; onClose: () => void }) {
  const copy = (url: string) => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy. Select the link and copy it."));
  const state = (id: string) => result.invites.find((i) => i.participantId === id);
  const failed = result.invites.filter((i) => i.state === "failed");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-background p-6 shadow-2xl">
        <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-6 text-emerald-500" /><div><h2 className="text-lg font-semibold">Meeting scheduled</h2><p className="text-sm text-muted-foreground">{result.meeting.title}</p></div></div>
        {failed.length > 0 && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">{failed.length === 1 ? "One invitation" : `${failed.length} invitations`} could not be emailed ({failed.map((f) => f.name).join(", ")}). Copy their links below and send them yourself.</p>}
        {result.guestLinks.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Personal guest links</p>
            <p className="text-xs text-muted-foreground">Each link is for one person. For security it is shown only now; you can create a new one any time from the meeting page.</p>
            {result.guestLinks.map((g) => {
              const s = state(g.participantId);
              return (
                <div key={g.participantId} className="flex items-center gap-2 rounded-lg border p-2">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{g.name}{s ? <span className={cn("ml-2 text-[11px] font-normal", s.state === "sent" ? "text-emerald-600" : "text-amber-600")}>{s.state === "sent" ? "invitation emailed" : s.state === "skipped" ? "no email address" : "email failed"}</span> : null}</p><p className="truncate text-xs text-muted-foreground">{g.url}</p></div>
                  <Button variant="outline" size="sm" onClick={() => void copy(g.url)}><Copy className="size-3.5" />Copy</Button>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Done</Button><a className={buttonVariants()} href={`/dealflow-ai/meetings/${result.meeting.roomId}/details`}>Open meeting</a></div>
      </div>
    </div>
  );
}
