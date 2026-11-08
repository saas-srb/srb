import { redirect } from "next/navigation";

export default function LegacyVoiceConfigPage() {
  redirect("/commandos/chatbot/voice/config");
}
