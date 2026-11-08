/** RFC 5545 calendar invitations for meetings. Pure. UID is stable per meeting; SEQUENCE goes up on every reschedule; cancel uses METHOD:CANCEL with the same UID. */

export interface IcsInput {
  roomId: string;
  title: string;
  description?: string;
  start: Date;
  durationMinutes: number;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  /** Where the person joins (their personal link for guests). */
  url: string;
  /** Deterministic "now" for DTSTAMP (tests). */
  stamp?: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");
export function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines are folded at 75 octets (RFC 5545 3.1), continuation lines start with one space. Never splits a UTF-8 character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74;
    }
    cur += ch;
    curBytes += b;
  }
  if (cur) out.push(cur);
  return out.join("\r\n ");
}

const cn = (s: string) => s.replace(/["\r\n]/g, "").trim();

export function meetingUid(roomId: string): string {
  return `${roomId}@meetings.selfrun`;
}

export function buildIcs(i: IcsInput): string {
  const end = new Date(i.start.getTime() + i.durationMinutes * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SelfRun//DealFlow Meetings//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${i.method}`,
    "BEGIN:VEVENT",
    `UID:${meetingUid(i.roomId)}`,
    `SEQUENCE:${i.sequence}`,
    `DTSTAMP:${icsDate(i.stamp ?? new Date())}`,
    `DTSTART:${icsDate(i.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(i.method === "CANCEL" ? `Cancelled: ${i.title}` : i.title)}`,
    ...(i.description ? [`DESCRIPTION:${icsEscape(i.description)}`] : []),
    `LOCATION:${icsEscape(i.url)}`,
    `URL:${i.url}`,
    `ORGANIZER;CN="${cn(i.organizer.name)}":mailto:${i.organizer.email}`,
    `ATTENDEE;CN="${cn(i.attendee.name)}";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=${i.method === "REQUEST" ? "TRUE" : "FALSE"}:mailto:${i.attendee.email}`,
    `STATUS:${i.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    ...(i.method === "REQUEST" ? ["BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", "DESCRIPTION:Meeting starts in 10 minutes", "END:VALARM"] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
