import "server-only";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { createAgentClient, type AgentClient } from "@/lib/products/agentos/voice/elevenlabs-agent";

/** Where a company fixes a missing ElevenLabs key. */
export const ELEVENLABS_SETTINGS_HREF = "/commandos/settings/integrations";

export const NOT_CONFIGURED_MESSAGE = "ElevenLabs isn't connected for this workspace. Add your ElevenLabs API key in Settings → Integrations.";

/** The company's own ElevenLabs key, else SelfRun's (same resolution as the rest of the app). Null when neither exists. */
export async function workspaceAgentClient(): Promise<AgentClient | null> {
  const apiKey = (await connectionValues("elevenlabs"))?.apiKey;
  return apiKey ? createAgentClient({ apiKey }) : null;
}
