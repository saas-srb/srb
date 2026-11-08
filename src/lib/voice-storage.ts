import "server-only";
import { randomUUID } from "node:crypto";
import { putObject, getObject, deleteObject } from "@/lib/storage/blob";

const FOLDER = "voice";

export interface StoredVoiceAudio {
  storageKey: string;
  size: number;
}

/** Persists an AI voice response (mp3). storageKey is server-generated. */
export async function saveVoiceAudio(audio: Buffer, ext = "mp3"): Promise<StoredVoiceAudio> {
  const key = `${randomUUID()}.${ext}`;
  const { storageKey, size } = await putObject(FOLDER, key, audio, `audio/${ext === "mp3" ? "mpeg" : ext}`);
  return { storageKey, size };
}

export async function readVoiceAudioStream(storageKey: string) {
  return getObject(storageKey);
}

export async function readVoiceAudioBuffer(storageKey: string): Promise<Buffer> {
  const result = await getObject(storageKey);
  if (!result) throw new Error(`Voice audio not found: ${storageKey}`);
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function deleteVoiceAudio(storageKey: string | null | undefined): Promise<void> {
  await deleteObject(storageKey);
}
