/**
 * The words spoken to the person on the phone, in plain language: the recording notice, the AI disclosure and the "a team member has joined"
 * announcement. Pure (no database, no network). English and Hindi, chosen by the agent's language (or the call's transcription language).
 * The company's own disclosure line is used as written; only the notices that belong to the platform are translated here.
 */

export type NoticeLanguage = "en" | "hi";

/** "hi", "hi-IN" -> Hindi; everything else English. */
export function noticeLanguage(code: string | null | undefined): NoticeLanguage {
  return (code ?? "").toLowerCase().split(/[-_]/)[0] === "hi" ? "hi" : "en";
}

export const RECORDING_NOTICE: Record<NoticeLanguage, string> = {
  en: "This call may be recorded, and a transcript may be kept, so that the company can follow up on it.",
  hi: "यह कॉल रिकॉर्ड की जा सकती है और उसका ट्रांसक्रिप्ट रखा जा सकता है, ताकि कंपनी आगे की कार्रवाई कर सके।",
};

export const HUMAN_JOINED: Record<NoticeLanguage, string> = {
  en: "A team member has joined the call.",
  hi: "टीम का एक सदस्य कॉल में शामिल हो गया है।",
};
export const HUMAN_TOOK_OVER: Record<NoticeLanguage, string> = {
  en: "A team member has taken over the call.",
  hi: "टीम के एक सदस्य ने कॉल संभाल ली है।",
};

export type AnnouncementKind = "joined" | "took_over";
export const announcementText = (kind: AnnouncementKind, lang: NoticeLanguage) => (kind === "joined" ? HUMAN_JOINED : HUMAN_TOOK_OVER)[lang];

/** The opening words of an outbound call: [recording notice] [AI disclosure] [the agent's own greeting]. Null when there is nothing to add. */
export function composeOpening(i: {
  language: string | null | undefined;
  /** Say the recording notice here (false when the conference already played it). */
  recordingNotice: boolean;
  /** The company's disclosure line, spoken when the disclosure setting is on. */
  disclosureLine: string | null | undefined;
  requireDisclosure: boolean;
  firstMessage: string | null | undefined;
}): string | null {
  const parts: string[] = [];
  if (i.recordingNotice) parts.push(RECORDING_NOTICE[noticeLanguage(i.language)]);
  const disclosure = i.requireDisclosure ? (i.disclosureLine ?? "").trim() : "";
  if (disclosure) parts.push(disclosure);
  if (!parts.length) return null;
  const greeting = (i.firstMessage ?? "").trim();
  if (greeting) parts.push(greeting);
  return parts.join(" ").replace(/\s+/g, " ").slice(0, 1500);
}
