import { notFound, redirect } from "next/navigation";
import { getMeeting } from "@/lib/dealflow-ai/db-meetings";
import { canSeeMeeting, staffProfile } from "@/lib/dealflow-ai/meetings/access";
import JoinFlow from "@/components/products/dealflow-ai/meetings/JoinFlow";
import { requireLmsPage } from "@/lib/lms-auth";

export const dynamic = "force-dynamic";

/**
 * The room for signed-in staff. Nothing is issued here: JoinFlow asks the token route (which checks the roster) and renders the live room
 * (`MeetingRoom`) with what the server returns. Guests use `/meeting/[roomId]?t=…`.
 */
export default async function MeetingRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const user = await requireLmsPage("VIEW_LEADS");
  const { roomId } = await params;
  const meeting = await getMeeting(roomId);
  if (!meeting || !canSeeMeeting(user, meeting)) notFound();
  if (meeting.status === "ended" || meeting.status === "cancelled") redirect(`/dealflow-ai/meetings/${roomId}/details`);
  const profile = await staffProfile(user.id);
  const me = meeting.participants.find((p) => p.kind === "internal" && p.refId === user.id);
  return (
    <JoinFlow
      roomId={roomId}
      title={meeting.title}
      scheduledAt={meeting.scheduledAt}
      timezone={meeting.timezone}
      displayName={me?.name ?? profile?.name ?? user.email}
      leaveHref={`/dealflow-ai/meetings/${roomId}/details`}
    />
  );
}
