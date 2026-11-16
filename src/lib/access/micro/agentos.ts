import type { MicroFeature } from "./types";

const P = "agentos";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all"];

/** What everybody given AgentOS gets: the dashboard (which shows only what their other features allow). */
const BASELINE = new Set(["dashboard.view"]);

const ROWS: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the AgentOS dashboard: the person's own usage and recent chats.", "read", ["aibots.USE_BOT"]],
  ["agents.view", "Agents", "page", "See agents", "See the agent hub and the agents the person may use, without chatting with them. This is the read-only level.", "read", ["aibots.USE_BOT"]],
  ["agents.use", "Agents", "button", "Chat and talk with agents", "Start, continue, rename and delete their own chats and voice sessions with the agents they may use (this creates conversations, so it is not read-only).", "write", ["aibots.USE_BOT"]],
  ["agents.create", "Agents", "button", "Create agents", "Create a new agent (instructions, model, access list).", "write", ["aibots.CREATE_BOT"]],
  ["agents.edit", "Agents", "button", "Edit agents", "Edit any agent's details, instructions, model, access list and status. Can use every agent.", "write", ["aibots.EDIT_BOT", "aibots.isAibotsManagerTier"]],
  ["agents.delete", "Agents", "button", "Delete agents", "Delete an agent and its knowledge base.", "write", ["aibots.DELETE_BOT"]],
  ["knowledge.manage", "Knowledge base", "button", "Manage knowledge files", "Edit knowledge-base file details and switch individual files on or off.", "write", ["aibots.MANAGE_KB"]],
  ["knowledge.upload", "Knowledge base", "button", "Upload knowledge files", "Upload new or replacement files to an agent's knowledge base.", "write", ["aibots.UPLOAD_FILES"]],
  ["knowledge.delete", "Knowledge base", "button", "Delete knowledge files", "Remove files from an agent's knowledge base.", "write", ["aibots.DELETE_FILES"]],
  ["chats.all", "Chats", "scope", "Read everyone's chats", "Read every person's chats with every agent (oversight, read only). Without it a person sees only their own chats.", "read", ["aibots.VIEW_CHATS", "aibots.isAibotsManagerTier"], "all"],
  ["chats.delete", "Chats", "button", "Delete other people's chats", "Delete chats that belong to other people. Everyone can always delete their own.", "write", ["aibots.DELETE_CHATS"]],
  ["calls.view", "Voice calls", "page", "See calls", "Open the call list and the person's own call details.", "read", ["aibots.USE_BOT"]],
  ["calls.place", "Voice calls", "button", "Place voice calls", "Start or schedule a phone call with a voice agent they may use. Every call is checked against the calling rules and logged.", "write", ["aibots.VOICE_CALL"]],
  ["calls.takeover", "Voice calls", "button", "Take over live calls", "Watch a live call, add a note for the AI mid-call, end the call or move it to a human's phone.", "write", ["aibots.VOICE_CALL_TAKEOVER"]],
  ["calls.manage", "Voice calls", "button", "Manage voice calls and numbers", "Cancel other people's scheduled calls, call outside calling hours, and manage phone numbers, the do-not-call list and calling rules.", "write", ["aibots.VOICE_CALL_MANAGE"]],
  ["activity.view", "Activity log", "page", "Read the activity log", "Open the AgentOS activity log.", "read", ["aibots.VIEW_AUDIT"]],
  ["settings.manage", "Settings", "section", "Change AgentOS settings", "Change allowed models, token pricing and limits.", "write", ["aibots.MANAGE_SETTINGS"]],
];

export const AGENTOS_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
