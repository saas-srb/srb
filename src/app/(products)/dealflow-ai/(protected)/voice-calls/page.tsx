import { requireLmsPage } from "@/lib/lms-auth";
import { getViewer } from "@/lib/products/agentos/viewer";
import VoiceCallsClient from "@/components/products/dealflow-ai/voice-calls/VoiceCallsClient";
import { listActiveDealflowCalls, listCallPeople } from "@/lib/dealflow-ai/call-panel";

export const dynamic = "force-dynamic";

export default async function PageVoiceCalls({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const user = await requireLmsPage("VIEW_LEADS");
  const { person } = await searchParams;
  const ctx = { lms: user, agentos: await getViewer().catch(() => null) };
  const [people, active] = await Promise.all([listCallPeople(ctx, {}), listActiveDealflowCalls(ctx)]);
  const initialSelected = typeof person === "string" && /^(lead|applicant|submission):[^\s]{1,80}$/.test(person) ? person : undefined;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <VoiceCallsClient initialPeople={people} initialActive={active} initialSelected={initialSelected} />
    </div>
  );
}
