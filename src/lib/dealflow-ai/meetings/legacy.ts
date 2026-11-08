import { DEFAULT_AGENT_RUNTIME, type MeetingDoc, type MeetingParticipant, type MeetingStatus } from "@/lib/dealflow-ai/meetings/types";

/**
 * Meetings written before the n-participant model had clientName/clientEmail/agentIds/salesPersonName and no roster. They are turned into the
 * new shape when read (and written back once by the store), so nothing already scheduled is lost. Pure.
 */

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === "string" ? v : "");
const text = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isLegacyMeeting(raw: any): boolean {
  return !Array.isArray(raw?.participants);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateLegacyMeeting(raw: any): MeetingDoc {
  const created = iso(raw.createdAt);
  const participants: MeetingParticipant[] = [];
  const salesName = text(raw.salesPersonName, 120);
  participants.push({ id: "p_legacy_host", kind: "internal", role: "host", name: salesName || "Host", refId: null, invitedAt: created });
  const clientName = text(raw.clientName, 120);
  if (clientName || text(raw.clientEmail)) {
    const email = text(raw.clientEmail).toLowerCase();
    participants.push({
      id: "p_legacy_client", kind: "external", role: "participant", name: clientName || email || "Guest", refId: null,
      ...(email ? { email } : {}), ...(text(raw.clientPhone, 40) ? { phone: text(raw.clientPhone, 40) } : {}), ...(text(raw.clientCompany, 160) ? { company: text(raw.clientCompany, 160) } : {}),
      joinTokenHash: null, invitedAt: created,
    });
  }
  const ids: string[] = Array.isArray(raw.agentIds) ? raw.agentIds.map(String) : [];
  const names: string[] = Array.isArray(raw.agentNames) ? raw.agentNames.map(String) : [];
  ids.forEach((id, i) => participants.push({ id: `p_legacy_agent_${i}`, kind: "agent", role: "participant", name: names[i] || "AI agent", refId: id, aliases: [], invitedAt: created }));
  const notes = text(raw.notes, 4000);
  const status: MeetingStatus = ["scheduled", "live", "ended", "cancelled"].includes(raw.status) ? raw.status : "scheduled";
  return {
    ...(raw._id ? { _id: String(raw._id) } : {}),
    roomId: String(raw.roomId ?? ""),
    title: text(raw.title, 200) || "Meeting",
    agenda: notes ? { title: "Notes", description: notes } : null,
    scheduledAt: iso(raw.scheduledAt),
    durationMinutes: Number(raw.durationMinutes) || 30,
    timezone: "Asia/Kolkata",
    status,
    participants,
    agentSettings: { ...DEFAULT_AGENT_RUNTIME },
    ...(raw.recordingUrl ? { recordingUrl: String(raw.recordingUrl) } : {}),
    ...(raw.transcript ? { transcript: String(raw.transcript) } : {}),
    ...(raw.summary ? { summary: String(raw.summary) } : {}),
    target: null, sequence: 0, rev: 0, waitingRoom: false, locked: false, audit: [], remindersSent: {},
    createdBy: "legacy",
    createdAt: created,
    updatedAt: iso(raw.updatedAt) || created,
  };
}
