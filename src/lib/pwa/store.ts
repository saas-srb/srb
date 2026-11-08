import "server-only";
import { getDb } from "@/lib/mongodb";
import { DEFAULT_APP_SETTINGS, normalizeAppSettings, type AppSettings } from "@/lib/pwa/settings";

export const APP_SETTINGS_COLLECTION = "pwa_settings";

interface Doc {
  _id: string;
  settings?: unknown;
  updatedAt?: Date;
}

const col = async () => (await getDb()).collection<Doc>(APP_SETTINGS_COLLECTION);

export async function getAppSettings(): Promise<{ settings: AppSettings; updatedAt: Date | null }> {
  const doc = await (await col()).findOne({ _id: "default" });
  return { settings: doc?.settings ? normalizeAppSettings(doc.settings) : DEFAULT_APP_SETTINGS, updatedAt: doc?.updatedAt ?? null };
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await (await col()).updateOne({ _id: "default" }, { $set: { settings, updatedAt: new Date() } }, { upsert: true });
}

export async function resetAppSettings(): Promise<void> {
  await (await col()).deleteOne({ _id: "default" });
}
