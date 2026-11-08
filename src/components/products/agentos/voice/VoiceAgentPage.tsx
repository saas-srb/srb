import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { History, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import VoiceWorkspace from "@/components/products/agentos/voice/VoiceWorkspace";
import AgentKindBadge from "@/components/products/agentos/AgentKindBadge";
import { toSummary, type BotDoc } from "@/lib/products/agentos/bots";
import { can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { isElevenLabsConfigured } from "@/lib/elevenlabs";
import { listVoiceCalls, reconcileVoiceCalls } from "@/lib/products/agentos/voice/calls";
import { ELEVENLABS_SETTINGS_HREF, NOT_CONFIGURED_MESSAGE } from "@/lib/products/agentos/voice/connection";

/** The talk surface of a voice agent (server part): works out whether a call can start, and loads the viewer's call history. */
export default async function VoiceAgentPage({ viewer, bot }: { viewer: AibotsViewer; bot: BotDoc }) {
  const editor = can(viewer, "EDIT_BOT");
  // Calls the browser never finished (tab closed mid-call) are completed and metered here before the history is read.
  await reconcileVoiceCalls(viewer, bot._id);
  const [configured, calls] = await Promise.all([isElevenLabsConfigured(), listVoiceCalls(viewer, bot._id)]);
  const voice = bot.voice;

  let blocked: { message: string; settingsHref: string | null } | null = null;
  if (!configured) {
    blocked = { message: NOT_CONFIGURED_MESSAGE, settingsHref: can(viewer, "MANAGE_SETTINGS") ? ELEVENLABS_SETTINGS_HREF : null };
  } else if (bot.status !== "active") {
    blocked = { message: "This agent is switched off.", settingsHref: editor ? `/agentos/bots/${bot._id}` : null };
  } else if (!voice?.elevenAgentId) {
    blocked = {
      message: editor
        ? voice?.syncError
          ? `The agent isn't set up on ElevenLabs yet: ${voice.syncError}`
          : "The agent hasn't been set up on ElevenLabs yet. Open its settings and use Sync now."
        : "This agent isn't ready yet. Ask an editor to finish setting it up.",
      settingsHref: editor ? `/agentos/bots/${bot._id}` : null,
    };
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PanelPageHeader
        title={<span className="inline-flex items-center gap-2">{bot.name} <AgentKindBadge kind="voice" /></span>}
        description={<>{bot.description || "Talk to this agent out loud."}</>}
        actions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/agentos/calls?bot=${encodeURIComponent(bot._id)}`} />}>
              <History className="size-3.5" /> Call history
            </Button>
            {editor && (
              <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/agentos/bots/${bot._id}`} />} aria-label="Agent settings">
                <Settings className="size-4" />
              </Button>
            )}
          </div>
        }
      />
      <div className="min-h-0 flex-1">
        <VoiceWorkspace
          bot={toSummary(bot)}
          blocked={blocked}
          voiceName={voice?.voiceName ?? null}
          languageLabel={voice?.language ? voice.language.toUpperCase() : null}
          maxDurationSecs={voice?.maxDurationSecs ?? null}
          initialCalls={calls}
        />
      </div>
    </div>
  );
}
