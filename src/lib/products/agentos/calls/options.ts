import { maskPhone } from "@/lib/products/agentos/calls/phone";
import "server-only";
import { avatarUrlFor } from "@/lib/products/agentos/avatar-shared";
import { botsCollection, normalizeBot, usableAgentsFilter } from "@/lib/products/agentos/bots";
import { agentProblem, companyTimeZone, type GuardDeps } from "@/lib/products/agentos/calls/guards";
import { hasOutboundNumber } from "@/lib/products/agentos/calls/numbers";
import { CALL_PURPOSES, usesBriefing } from "@/lib/products/agentos/calls/purposes";
import { getCallSettings } from "@/lib/products/agentos/calls/settings";
import { can, type AibotsViewer } from "@/lib/products/agentos/viewer";

/**
 * Everything the call dialog needs to render, in one read: the voice agents this person may use (with the purposes each supports),
 * the company's calling rules, and a list of plain reasons why calling isn't possible yet. Nothing here is a default: every value
 * comes from the company's own agents and settings.
 */

export interface CallAgentOption {
  id: string;
  name: string;
  icon: string;
  color: string;
  avatarUrl: string | null;
  category: string;
  description: string;
  /** The persona the agent speaks as (blank when the editor didn't set one). */
  displayName: string;
  jobTitle: string;
  language: string;
  /** Purposes this agent may be used for. An agent with none chosen is limited to "custom", like the engine's guard. */
  purposes: string[];
  /** False when the engine would refuse this agent right now; `notReady` says why. */
  ready: boolean;
  notReady: string | null;
}

export type CallBlockerCode = "no_permission" | "no_agent" | "no_ready_agent" | "no_number" | "no_countries" | "not_connected" | "no_timezone";

export interface CallBlocker {
  code: CallBlockerCode;
  message: string;
  /** Where a calls manager can fix it. */
  link: { label: string; href: string } | null;
}

export interface CallOptions {
  canCall: boolean;
  isManager: boolean;
  blockers: CallBlocker[];
  agents: CallAgentOption[];
  purposes: { key: string; label: string; description: string; hasNotes: boolean; /** The agent gets a briefing about the person (history, chats, earlier calls): the dialog shows a preview of it. */ hasBriefing: boolean }[];
  allowedCodes: string[];
  window: { start: string; end: string };
  timeZone: string | null;
  recordingNotice: boolean;
  /** Test mode: the masked number every call goes to instead of the person's own (null = real calls). */
  testNumberMasked: string | null;
}

export interface OptionDeps extends GuardDeps {
  hasNumber?: () => Promise<boolean>;
}

export async function loadCallOptions(viewer: AibotsViewer, deps: OptionDeps = {}): Promise<CallOptions> {
  const isManager = can(viewer, "VOICE_CALL_MANAGE");
  const canCall = can(viewer, "VOICE_CALL");
  const [settings, timeZone, hasNumber, rows, connected] = await Promise.all([
    getCallSettings(),
    (deps.timeZone ?? companyTimeZone)(),
    (deps.hasNumber ?? hasOutboundNumber)(),
    botsCollection().then((c) => c.find(usableAgentsFilter(viewer, "voice")).sort({ name: 1 }).limit(500).toArray()),
    (deps.connected ?? (async () => Boolean(await (await import("@/lib/products/agentos/voice/connection")).workspaceAgentClient())))(),
  ]);
  const agents: CallAgentOption[] = rows.map(normalizeBot).map((b) => {
    const problem = agentProblem(b);
    return {
      id: b._id,
      name: b.name,
      icon: b.icon,
      color: b.color,
      avatarUrl: avatarUrlFor(b._id, b.avatarKey),
      category: b.category,
      description: b.description,
      displayName: b.voice?.displayName ?? "",
      jobTitle: b.voice?.jobTitle ?? "",
      language: b.voice?.language ?? "",
      purposes: b.voice?.purposes?.length ? [...b.voice.purposes] : ["custom"],
      ready: problem === null,
      notReady: problem,
    };
  });

  const link = (label: string, href: string) => (isManager ? { label, href } : null);
  const blockers: CallBlocker[] = [];
  if (!canCall) blockers.push({ code: "no_permission", message: "You don't have permission to place calls. Ask an admin to allow \"Place voice calls\" for you in AgentOS.", link: null });
  if (agents.length === 0) blockers.push({ code: "no_agent", message: "There is no voice agent you can use yet. Ask an AgentOS editor to create a voice agent and give you access.", link: link("Create a voice agent", "/agentos/bots/new") });
  else if (!agents.some((a) => a.ready)) blockers.push({ code: "no_ready_agent", message: "None of your voice agents is ready to call. Open an agent to see what it needs.", link: link("Manage agents", "/agentos/bots") });
  if (!connected) blockers.push({ code: "not_connected", message: "ElevenLabs isn't connected for this workspace. Ask an admin to add the ElevenLabs key under Settings → Integrations.", link: link("Open integrations", "/commandos/settings/integrations") });
  if (!hasNumber) blockers.push({ code: "no_number", message: "No phone number is set up for outbound calls. Ask an admin to add a phone number in CommandOS → AgentOS settings → Phone.", link: link("Add a phone number", "/commandos/settings/products/agentos/phone") });
  if (settings.allowedCallingCodes.length === 0) blockers.push({ code: "no_countries", message: "Calling isn't set up yet: no country is allowed. Ask an admin to choose the allowed countries in CommandOS → AgentOS settings → Phone → Call settings.", link: link("Open call settings", "/commandos/settings/products/agentos/phone/settings") });
  if (!timeZone) blockers.push({ code: "no_timezone", message: "The workspace time zone isn't set, so calling hours can't be checked. Ask an admin to set it in the workspace settings.", link: null });

  return {
    canCall,
    isManager,
    blockers,
    agents,
    purposes: CALL_PURPOSES.map((p) => ({ key: p.key, label: p.label, description: p.description, hasNotes: p.variables.some((v) => v.key === "notes"), hasBriefing: usesBriefing([p.key]) })),
    allowedCodes: settings.allowedCallingCodes,
    window: { start: settings.windowStart, end: settings.windowEnd },
    timeZone,
    recordingNotice: settings.recordingNotice,
    testNumberMasked: settings.testNumber ? maskPhone(settings.testNumber) : null,
  };
}
