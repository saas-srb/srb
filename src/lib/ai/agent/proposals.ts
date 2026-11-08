import "server-only";
import { randomUUID } from "node:crypto";
import type OpenAI from "openai";
import { getDb } from "@/lib/mongodb";
import type { Json } from "@/lib/ai/agent/types";

/**
 * A proposal is what the agent wants to change, held on the server until the person approves or rejects it. The client only ever
 * gets an id back, so it can't alter what will run. Valid for 30 minutes, usable once, and only by the person it was made for.
 */
const TTL_MS = 30 * 60_000;

export interface PendingCall {
  id: string;
  tool: string;
  args: Json;
  destructive: boolean;
}

export interface StoredProposal {
  _id: string;
  userId: string;
  panel: string;
  status: "pending" | "running" | "done" | "rejected";
  createdAt: Date;
  expiresAt: Date;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  calls: PendingCall[];
  steps: { label: string; ok: boolean }[];
  changed: boolean;
  autoApprove: boolean;
  /** The language the conversation was in, so the follow-up after approval speaks it too. */
  lang?: "hindi" | "english" | "hinglish";
}

let indexed = false;
async function col() {
  const c = (await getDb()).collection<StoredProposal>("ai_agent_proposals");
  if (!indexed) {
    indexed = true;
    await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
  }
  return c;
}

/** Images are not kept in the stored conversation: the model has already read them and put what it needs into the call. */
function stripBinary(messages: OpenAI.Chat.ChatCompletionMessageParam[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role !== "user" || !Array.isArray(m.content)) return m;
    return { ...m, content: m.content.map((p) => (p.type === "image_url" ? { type: "text" as const, text: "[image attached earlier]" } : (p as { type: string }).type === "file" ? { type: "text" as const, text: "[PDF attached earlier]" } : p)) };
  });
}

export async function saveProposal(p: Omit<StoredProposal, "_id" | "createdAt" | "expiresAt" | "status">): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  await (await col()).insertOne({ ...p, messages: stripBinary(p.messages), _id: id, status: "pending", createdAt: new Date(now), expiresAt: new Date(now + TTL_MS) });
  return id;
}

/** Atomically takes a pending proposal for execution (so a double click can't run it twice). */
export async function claimProposal(id: string, userId: string, status: "running" | "rejected"): Promise<StoredProposal | null> {
  return (await col()).findOneAndUpdate({ _id: id, userId, status: "pending", expiresAt: { $gt: new Date() } }, { $set: { status } }, { returnDocument: "before" });
}

export async function peekProposal(id: string, userId: string): Promise<StoredProposal | null> {
  return (await col()).findOne({ _id: id, userId, status: "pending", expiresAt: { $gt: new Date() } });
}

export async function finishProposal(id: string): Promise<void> {
  await (await col()).updateOne({ _id: id }, { $set: { status: "done" } });
}
