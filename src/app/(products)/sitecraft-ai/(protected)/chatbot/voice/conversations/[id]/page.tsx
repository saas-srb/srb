import { redirect } from "next/navigation";

export default async function LegacyVoiceConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/commandos/chatbot/voice-conversations/${encodeURIComponent(id)}`);
}
