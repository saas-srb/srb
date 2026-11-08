import { notFound } from "next/navigation";
import { requireLmsPage } from "@/lib/lms-auth";
import { getMeeting, toMeetingView } from "@/lib/dealflow-ai/db-meetings";
import { canHostMeeting, canSeeMeeting, staffProfile } from "@/lib/dealflow-ai/meetings/access";
import { runPostMeeting } from "@/lib/dealflow-ai/meetings/postmeeting";
import { SUMMARY_DELAY_MS } from "@/lib/dealflow-ai/meetings/sweep";
import { listStaffOptions } from "@/lib/dealflow-ai/meetings/service";
import { listUtterances } from "@/lib/dealflow-ai/meetings/utterances";
import { afterForCompany } from "@/lib/platform/tenancy/context";
import { listAgentsFor } from "@/lib/products/agentos/picker";
import MeetingDetailClient from "./MeetingDetailClient";

export const dynamic = "force-dynamic";

const nowMs = () => Date.now();

export default async function MeetingDetailsPage({ params }: { params: Promise<{ roomId: string }> }) {
  const user = await requireLmsPage("VIEW_LEADS");
  const { roomId } = await params;
  const m = await getMeeting(roomId);
  if (!m || !canSeeMeeting(user, m)) notFound();
  // The summary is normally written by the scheduled job; opening the page of an ended meeting makes sure it isn't left waiting.
  if (m.status === "ended" && !m.postProcessedAt && m.endedAt && nowMs() - new Date(m.endedAt).getTime() > SUMMARY_DELAY_MS) {
    await afterForCompany(() => runPostMeeting(roomId).catch((e) => console.error("[meetings] post-meeting failed", e)));
  }
  const canHost = canHostMeeting(user, m);
  const [agents, staff, profile, lines] = await Promise.all([listAgentsFor({ kind: "voice" }), canHost ? listStaffOptions("", 300) : Promise.resolve([]), staffProfile(user.id), m.status === "ended" && !m.transcript ? listUtterances(roomId) : Promise.resolve([])]);
  return <MeetingDetailClient initial={toMeetingView(m, { audit: canHost })} canHost={canHost} agents={agents} staff={staff} me={{ id: user.id, name: profile?.name ?? user.email }} pendingTranscript={lines.map((l) => `${l.speakerName}: ${l.text}`).join("\n")} />;
}
