import { redirect } from "next/navigation";

/**
 * The Phase 3 meeting room was replaced by the unified call room
 * (`/huddle-ai/call/[id]`). Meetings now launch a real WebRTC call from the
 * meeting detail page's "Join" button — this path just bounces there.
 */
export default async function LegacyMeetingRoomRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/huddle-ai/meetings/${id}`);
}
