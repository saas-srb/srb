import "server-only";
import { randomUUID } from "node:crypto";
import { botsCollection, getBot } from "@/lib/products/agentos/bots";
import { notDeleted, updateStamp } from "@/lib/products/agentos/db";
import { avatarStorageKey, checkAvatarBytes, isAvatarKeyOf } from "@/lib/products/agentos/avatar-shared";
import { AibotsInputError, NotFoundError } from "@/lib/products/agentos/viewer";

/**
 * Agent photos. The bytes go to the shared private Blob store (`@/lib/storage/blob`: virus/type scan, plan storage limit and
 * metering included); the bot row keeps only `avatarKey`. Photos are served by /api/agentos/bots/[botId]/avatar after an access check,
 * never from a public URL. The key is always read from the bot row, never from a request.
 */

export interface AvatarStore {
  put(storageKey: string, body: Buffer, contentType: string): Promise<void>;
  get(storageKey: string): Promise<{ body: Buffer; contentType: string } | null>;
  del(storageKey: string): Promise<void>;
}

export const blobAvatarStore: AvatarStore = {
  async put(storageKey, body, contentType) {
    const { putObject } = await import("@/lib/storage/blob");
    const i = storageKey.indexOf("/");
    await putObject(storageKey.slice(0, i), storageKey.slice(i + 1), body, contentType);
  },
  async get(storageKey) {
    const { getObject } = await import("@/lib/storage/blob");
    const obj = await getObject(storageKey);
    if (!obj) return null;
    const chunks: Uint8Array[] = [];
    const reader = obj.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return { body: Buffer.concat(chunks), contentType: obj.contentType };
  },
  async del(storageKey) {
    const { deleteObject } = await import("@/lib/storage/blob");
    await deleteObject(storageKey);
  },
};

/** Validates by content, stores the photo, points the bot at it and removes the previous file. Returns the new key. */
export async function setBotAvatar(botId: string, bytes: Uint8Array, actorId: string, store: AvatarStore = blobAvatarStore): Promise<string> {
  const check = checkAvatarBytes(bytes);
  if (!check.ok) throw new AibotsInputError(check.error);
  const bot = await getBot(botId);
  if (!bot) throw new NotFoundError();
  const key = avatarStorageKey(botId, randomUUID(), check.kind.ext);
  await store.put(key, Buffer.from(bytes), check.kind.type);
  const col = await botsCollection();
  const res = await col.updateOne({ _id: botId, ...notDeleted }, { $set: { avatarKey: key, ...updateStamp(actorId) } });
  if (res.matchedCount === 0) {
    await store.del(key).catch(() => {});
    throw new NotFoundError();
  }
  if (isAvatarKeyOf(botId, bot.avatarKey)) await store.del(bot.avatarKey).catch((e) => console.error("[agentos avatar] old photo not removed", e instanceof Error ? e.message : e));
  return key;
}

export async function removeBotAvatar(botId: string, actorId: string | null, store: AvatarStore = blobAvatarStore): Promise<void> {
  const bot = await getBot(botId);
  if (!bot) throw new NotFoundError();
  const col = await botsCollection();
  await col.updateOne({ _id: botId }, { $set: { avatarKey: null, ...updateStamp(actorId) } });
  if (isAvatarKeyOf(botId, bot.avatarKey)) await store.del(bot.avatarKey).catch((e) => console.error("[agentos avatar] photo not removed", e instanceof Error ? e.message : e));
}

/** Deletes the file of a bot being deleted (the row is soft-deleted separately). Best-effort. */
export async function purgeBotAvatar(bot: { _id: string; avatarKey?: string | null }, store: AvatarStore = blobAvatarStore): Promise<void> {
  if (isAvatarKeyOf(bot._id, bot.avatarKey)) await store.del(bot.avatarKey).catch(() => {});
}

export async function readBotAvatar(botId: string, store: AvatarStore = blobAvatarStore): Promise<{ body: Buffer; contentType: string } | null> {
  const bot = await getBot(botId);
  if (!bot || !isAvatarKeyOf(botId, bot.avatarKey)) return null;
  return store.get(bot.avatarKey);
}
