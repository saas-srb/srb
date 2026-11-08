"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Ban, Bot, CalendarClock, Check, ClipboardList, Copy, Link2, Loader2, Lock, LockOpen, Mail, Pencil, PhoneOff, Plus, RefreshCw, ShieldCheck, Trash2, UserCheck, UserX, Video, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import ScheduleMeeting from "@/components/products/dealflow-ai/meetings/ScheduleMeeting";
import { AgentAvatar, PersonAvatar } from "@/components/products/dealflow-ai/meetings/ParticipantStack";
import type { AgentOption } from "@/lib/products/agentos/picker-types";
import type { StaffOption } from "@/lib/dealflow-ai/meetings/service";
import type { MeetingParticipantView, MeetingView } from "@/lib/dealflow-ai/meetings/types";
import { formatLong, formatWhen, STATUS_STYLE } from "@/lib/dealflow-ai/meetings/ui";
import { cn } from "@/lib/utils";

const INVITE_LABEL: Record<string, { text: string; cls: string }> = {
  sent: { text: "Invitation sent", cls: "text-emerald-600 dark:text-emerald-400" },
  failed: { text: "Email failed", cls: "text-rose-600 dark:text-rose-400" },
  skipped: { text: "No email address", cls: "text-muted-foreground" },
  pending: { text: "Sending…", cls: "text-amber-600" },
  none: { text: "Not invited yet", cls: "text-muted-foreground" },
};
const LINK_LABEL: Record<string, string> = { active: "Link active", revoked: "Link revoked", expired: "Link expired", none: "No link" };

function Card({ title, icon: Icon, actions, children }: { title: string; icon?: React.ComponentType<{ className?: string }>; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <GlassCard className="px-4">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold">{Icon ? <Icon className="size-4 text-primary" /> : null}{title}</h2>{actions}</div>
      {children}
    </GlassCard>
  );
}

export default function MeetingDetailClient({ initial, canHost, agents, staff, me, pendingTranscript }: { initial: MeetingView; canHost: boolean; agents: AgentOption[]; staff: StaffOption[]; me: { id: string; name: string }; pendingTranscript: string }) {
  const [m, setM] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<"" | "guest" | "agent" | "staff">("");
  const [guest, setGuest] = useState({ name: "", email: "", phone: "", company: "" });
  const [pickId, setPickId] = useState("");
  const [recording, setRecording] = useState(m.recordingUrl ?? "");
  const [showTranscript, setShowTranscript] = useState(false);

  const open = m.status === "scheduled" || m.status === "live";
  const st = STATUS_STYLE[m.status];

  async function act(key: string, body: Record<string, unknown>, ok?: string) {
    setBusy(key);
    try {
      const r = await fetch(`/api/dealflow-ai/meetings/${m.roomId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setM(r.meeting);
      for (const g of r.guestLinks ?? []) setLinks((l) => ({ ...l, [g.participantId]: g.url }));
      const failed = (r.invites ?? []).filter((i: { state: string }) => i.state === "failed").length;
      if (failed) toast.warning(`${failed} invitation${failed === 1 ? "" : "s"} could not be emailed. See the status next to each person.`);
      else if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
      return false;
    } finally {
      setBusy(null);
    }
  }
  async function patch(key: string, body: Record<string, unknown>, ok: string) {
    setBusy(key);
    try {
      const r = await fetch(`/api/dealflow-ai/meetings/${m.roomId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setM(r.meeting);
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  }
  const copy = (url: string) => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy"));

  const staffP = m.participants.filter((p) => p.kind === "internal");
  const guests = m.participants.filter((p) => p.kind === "external");
  const bots = m.participants.filter((p) => p.kind === "agent");
  const waiting = guests.filter((g) => g.waitingSince && !g.admittedAt);

  const addGuest = async () => {
    if (await act("add", { action: "add_participants", participants: [{ kind: "external", ...guest }] }, "Guest added")) { setGuest({ name: "", email: "", phone: "", company: "" }); setAdding(""); }
  };
  const addPicked = async () => {
    if (!pickId) return;
    if (await act("add", { action: "add_participants", participants: [adding === "agent" ? { kind: "agent", refId: pickId } : { kind: "internal", refId: pickId }] }, adding === "agent" ? "Agent added" : "Team member added")) { setPickId(""); setAdding(""); }
  };

  const Person = ({ p }: { p: MeetingParticipantView }) => {
    const inv = INVITE_LABEL[p.invite?.state ?? "none"];
    return (
      <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 p-2.5">
        {p.kind === "agent" ? <AgentAvatar p={p} agents={agents} size="lg" /> : <PersonAvatar name={p.name} tone={p.kind === "internal" ? "staff" : "guest"} size="lg" />}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{p.name}{p.kind === "internal" && p.role !== "participant" ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{p.role === "host" ? "Host" : "Co-host"}</span> : null}{p.lastJoinedAt ? <span className="text-[11px] font-normal text-muted-foreground">joined {formatWhen(p.lastJoinedAt, m.timezone)}</span> : null}</p>
          <p className="truncate text-xs text-muted-foreground">{[p.email, p.phone, p.company].filter(Boolean).join(" · ") || (p.kind === "agent" ? (agents.find((a) => a.id === p.refId)?.category ?? "AI agent") : "")}</p>
          {p.kind !== "agent" && <p className="mt-0.5 text-[11px]"><span className={inv.cls}>{inv.text}{p.invite?.at ? ` · ${formatWhen(p.invite.at, m.timezone)}` : ""}</span>{p.invite?.error ? <span className="text-muted-foreground"> ({p.invite.error})</span> : null}{p.kind === "external" ? <span className="text-muted-foreground"> · {LINK_LABEL[p.link]}{p.joinTokenExpiresAt && p.link === "active" ? ` until ${formatWhen(p.joinTokenExpiresAt, m.timezone)}` : ""}</span> : null}</p>}
          {p.kind === "agent" && <p className="text-[11px] text-muted-foreground">Answers when addressed by {[p.name, ...(p.aliases ?? [])].join(", ")}.</p>}
          {links[p.id] && <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1"><code className="min-w-0 flex-1 truncate text-[11px]">{links[p.id]}</code><Button size="xs" variant="outline" onClick={() => void copy(links[p.id])}><Copy className="size-3" />Copy</Button></div>}
        </div>
        {canHost && open && (
          <div className="flex flex-wrap items-center gap-1">
            {p.kind === "external" && <>
              <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => void act(`regen${p.id}`, { action: "regenerate_link", participantId: p.id }, "New link ready. Copy it now; it won't be shown again.")} title="Creates a new personal link; the old one stops working"><RefreshCw className="size-3" />New link</Button>
              {p.link === "active" && <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => void act(`rev${p.id}`, { action: "revoke_link", participantId: p.id }, "Link revoked")}><Ban className="size-3" />Revoke</Button>}
              {p.email && <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => void act(`inv${p.id}`, { action: "resend_invites", participantIds: [p.id] }, "Invitation sent with a fresh link")} title="Sends the invitation again with a fresh personal link"><Mail className="size-3" />{p.invite?.state === "sent" ? "Resend" : "Invite"}</Button>}
            </>}
            {p.kind === "internal" && <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => void act(`role${p.id}`, { action: "update_participant", participantId: p.id, role: p.role === "participant" ? "cohost" : "participant" })}>{p.role === "participant" ? "Make co-host" : "Make participant"}</Button>}
            {p.kind === "agent" && <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => { const v = window.prompt(`Other names people may call ${p.name} (comma separated)`, (p.aliases ?? []).join(", ")); if (v !== null) void act(`al${p.id}`, { action: "update_participant", participantId: p.id, aliases: v.split(",").map((a) => a.trim()).filter(Boolean) }, "Aliases saved"); }}><Pencil className="size-3" />Aliases</Button>}
            <Button size="xs" variant="ghost" disabled={busy !== null} onClick={() => { if (window.confirm(`Remove ${p.name} from this meeting?`)) void act(`rm${p.id}`, { action: "remove_participant", participantId: p.id }, `${p.name} removed`); }} aria-label={`Remove ${p.name}`}><Trash2 className="size-3.5" /></Button>
          </div>
        )}
      </li>
    );
  };

  const transcript = m.transcript || pendingTranscript;
  const staffNotIn = staff.filter((s) => !staffP.some((p) => p.refId === s.id));
  const agentsNotIn = agents.filter((a) => !bots.some((p) => p.refId === a.id));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <Link href="/dealflow-ai/meetings" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All meetings</Link>

      <header className="relative flex flex-wrap items-start justify-between gap-4 overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-r from-primary/10 via-card to-card p-5 shadow-sm sm:p-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-black tracking-tight sm:text-3xl">{m.title}</h1><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1", st.className)}>{st.label}</span></div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="size-4" />{formatLong(m.scheduledAt, m.timezone)} · {m.durationMinutes} min · {m.timezone.replace(/_/g, " ")}</p>
          {m.target && <p className="text-sm text-muted-foreground">About <span className="font-medium text-foreground">{m.target.label}</span> ({m.target.entityType})</p>}
          {m.status === "cancelled" && <p className="text-sm text-rose-600">Cancelled{m.cancelReason ? `: ${m.cancelReason}` : ""}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {open && <a href={`/dealflow-ai/meetings/${m.roomId}`} className={cn(buttonVariants(), m.status === "live" && "bg-emerald-600 hover:bg-emerald-500")}><Video className="size-4" />{m.status === "live" ? "Join now" : "Join"}</a>}
          {canHost && open && m.status === "scheduled" && <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" />Edit / reschedule</Button>}
          {canHost && m.status === "scheduled" && <Button variant="destructive" disabled={busy !== null} onClick={() => { const reason = window.prompt("Cancel this meeting? Everyone who was invited gets a cancellation. Reason (optional):"); if (reason !== null) void patch("cancel", { status: "cancelled", reason }, "Meeting cancelled"); }}><Ban className="size-4" />Cancel meeting</Button>}
          {canHost && m.status === "live" && <Button variant="destructive" disabled={busy !== null} onClick={() => { if (window.confirm("End the meeting for everyone?")) void patch("end", { status: "ended" }, "Meeting ended"); }}><PhoneOff className="size-4" />End meeting</Button>}
        </div>
      </header>

      {canHost && open && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-sm">
          <ShieldCheck className="size-4 text-primary" />
          <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => void act("lock", { action: m.locked ? "unlock" : "lock" }, m.locked ? "Unlocked" : "Locked: new guests can't join")}>{m.locked ? <LockOpen className="size-3" /> : <Lock className="size-3" />}{m.locked ? "Unlock room" : "Lock room"}</Button>
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={!!m.waitingRoom} disabled={busy !== null} onChange={(e) => void act("wr", { action: "waiting_room", enabled: e.target.checked })} />Waiting room</label>
          {guests.some((g) => g.email) && <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => void act("resend", { action: "resend_invites" }, "Invitations sent")}><Mail className="size-3" />Send all invitations again</Button>}
        </div>
      )}

      {waiting.length > 0 && canHost && (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><UserCheck className="size-4" />Waiting to come in</p>
          {waiting.map((g) => <div key={g.id} className="flex items-center justify-between gap-2 text-sm"><span>{g.name}{g.company ? ` · ${g.company}` : ""}</span><span className="flex gap-1"><Button size="xs" onClick={() => void act(`ad${g.id}`, { action: "admit", participantId: g.id }, `${g.name} admitted`)}><Check className="size-3" />Admit</Button><Button size="xs" variant="outline" onClick={() => void act(`dn${g.id}`, { action: "deny", participantId: g.id })}><UserX className="size-3" />Deny</Button></span></div>)}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card title="Your team" actions={canHost && open ? <Button size="xs" variant="outline" onClick={() => { setAdding(adding === "staff" ? "" : "staff"); setPickId(""); }}><Plus className="size-3" />Add</Button> : null}>
            {adding === "staff" && <div className="mb-3 flex gap-2"><select className="h-8 flex-1 rounded-lg border border-input bg-background px-2 text-sm" value={pickId} onChange={(e) => setPickId(e.target.value)}><option value="">Choose a colleague</option>{staffNotIn.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><Button size="sm" disabled={!pickId || busy !== null} onClick={() => void addPicked()}>Add</Button></div>}
            <ul className="space-y-2">{staffP.map((p) => <Person key={p.id} p={p} />)}</ul>
          </Card>
          <Card title={`Guests (${guests.length})`} actions={canHost && open ? <Button size="xs" variant="outline" onClick={() => setAdding(adding === "guest" ? "" : "guest")}><Plus className="size-3" />Add guest</Button> : null}>
            {adding === "guest" && (
              <div className="mb-3 grid gap-2 sm:grid-cols-4">
                <Input placeholder="Name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
                <Input placeholder="Email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
                <Input placeholder="Phone +91…" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
                <div className="flex gap-2"><Input placeholder="Company" value={guest.company} onChange={(e) => setGuest({ ...guest, company: e.target.value })} /><Button size="sm" disabled={busy !== null || !guest.name.trim()} onClick={() => void addGuest()}>{busy === "add" ? <Loader2 className="size-3 animate-spin" /> : "Add"}</Button></div>
              </div>
            )}
            {guests.length ? <ul className="space-y-2">{guests.map((p) => <Person key={p.id} p={p} />)}</ul> : <p className="text-sm text-muted-foreground">No guests.</p>}
            {canHost && open && guests.length > 0 && <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground"><Link2 className="mt-0.5 size-3.5 shrink-0" />Personal links are shown only when created. Use &quot;New link&quot; to get one to copy; the old link stops working.</p>}
          </Card>
          <Card title={`AI agents (${bots.length})`} actions={canHost && open ? <Button size="xs" variant="outline" onClick={() => { setAdding(adding === "agent" ? "" : "agent"); setPickId(""); }}><Plus className="size-3" />Add agent</Button> : null}>
            {adding === "agent" && <div className="mb-3 flex gap-2"><select className="h-8 flex-1 rounded-lg border border-input bg-background px-2 text-sm" value={pickId} onChange={(e) => setPickId(e.target.value)}><option value="">Choose a voice agent</option>{agentsNotIn.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><Button size="sm" disabled={!pickId || busy !== null} onClick={() => void addPicked()}>Add</Button></div>}
            {bots.length ? <ul className="space-y-2">{bots.map((p) => <Person key={p.id} p={p} />)}</ul> : <p className="text-sm text-muted-foreground">No AI agents in this meeting. {canHost && open ? "Add one any time, even during the meeting." : ""}</p>}
            {m.status === "live" && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Bot className="size-3.5" />Agents added now join the room within a few seconds.</p>}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Agenda" icon={ClipboardList}>
            {m.agenda ? <div className="space-y-3 text-sm"><p className="whitespace-pre-wrap">{m.agenda.description || m.agenda.title}</p>{m.agenda.agentGoal && <div className="rounded-lg bg-muted/50 p-2.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Goal for the AI agents</p><p className="mt-1 whitespace-pre-wrap">{m.agenda.agentGoal}</p></div>}</div> : <p className="text-sm text-muted-foreground">No agenda was set.</p>}
          </Card>

          {m.status === "ended" && (
            <Card title="After the meeting" icon={BotAvatarIcon} actions={canHost && !m.summary ? <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => void act("sum", { action: "generate_summary" }, "Summary requested")}>{busy === "sum" ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}Generate summary</Button> : null}>
              {m.summary ? (
                <div className="space-y-3 text-sm">
                  <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Summary</p><p className="mt-1 whitespace-pre-wrap">{m.summary}</p></div>
                  {m.actionItems && m.actionItems.length > 0 && <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Action items</p><ul className="mt-1 space-y-1.5">{m.actionItems.map((a, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" /><span>{a.text}{a.owner ? <span className="text-muted-foreground"> · {a.owner}</span> : null}{a.due ? <span className="text-muted-foreground"> · due {a.due}</span> : null}</span></li>)}</ul></div>}
                </div>
              ) : <p className="text-sm text-muted-foreground">{m.summaryNote ?? (m.postProcessedAt ? "No summary was produced." : "The summary and action items are written a couple of minutes after the meeting ends.")}</p>}
              {transcript ? <div className="mt-3"><button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setShowTranscript((v) => !v)}>{showTranscript ? "Hide transcript" : "Show transcript"}</button>{showTranscript && <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs">{transcript}</pre>}</div> : null}
              <div className="mt-3 border-t pt-3">
                {m.recordingUrl ? <a className="text-sm font-medium text-primary hover:underline" href={m.recordingUrl} target="_blank" rel="noopener noreferrer">Open recording</a> : canHost ? (
                  <div className="flex gap-2"><Input className="h-8" placeholder="Recording link (https://…)" value={recording} onChange={(e) => setRecording(e.target.value)} /><Button size="sm" variant="outline" disabled={!recording.trim() || busy !== null} onClick={() => void patch("rec", { recordingUrl: recording.trim() }, "Recording link saved")}>Save</Button></div>
                ) : <p className="text-xs text-muted-foreground">No recording link.</p>}
              </div>
            </Card>
          )}

          {canHost && m.audit && m.audit.length > 0 && (
            <Card title="Activity">
              <ul className="max-h-72 space-y-1.5 overflow-y-auto text-xs">{[...m.audit].reverse().slice(0, 60).map((a, i) => <li key={i} className="flex justify-between gap-2"><span><span className="font-medium">{a.actorName}</span> <span className="text-muted-foreground">{a.action.replace(/_/g, " ")}{a.detail ? ` · ${a.detail}` : ""}</span></span><span className="shrink-0 text-muted-foreground">{formatWhen(a.at, m.timezone)}</span></li>)}</ul>
            </Card>
          )}
        </div>
      </div>

      {editing && <ScheduleMeeting key="edit" open onClose={() => setEditing(false)} staff={staff} agents={agents} me={me} meeting={m} onCreated={() => undefined} onUpdated={(u) => { setM(u); setEditing(false); }} />}
    </div>
  );
}

function BotAvatarIcon({ className }: { className?: string }) {
  return <BotAvatar icon="sparkles" color="violet" size="sm" className={className} />;
}
