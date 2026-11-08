import type { FetchFn } from "./types";

/**
 * Live check of which Gemini models the company's key can use (GET /v1beta/models).
 *
 * Verified 2026-11-01 against ai.google.dev/gemini-api/docs/deprecations (page updated 2026-10-22): `gemini-omni-1.1-flash` is the only
 * video model with no announced shutdown and is Google's recommended replacement for every Veo model. Shut down / past their earliest
 * shutdown date: `veo-3.0-generate-001`, `veo-3.0-fast-generate-001`, `veo-2.0-generate-001` (2026-06-30), `veo-3.1-*-preview` and
 * `gemini-omni-flash-preview` (2026-10-22), `veo-3.0-*-preview` (2025-11-12). Google states these dates are the earliest, not confirmed
 * ones, which is why availability is read live instead of assumed.
 */
export const VIDEO_MODEL_REPLACEMENT = "gemini-omni-1.1-flash";

export type GeminiModelList = { ok: true; ids: string[] } | { ok: false; error: string };

export async function fetchGeminiModelIds(apiKey: string, fetchFn: FetchFn = fetch): Promise<GeminiModelList> {
  const ids: string[] = [];
  try {
    let pageToken = "";
    for (let page = 0; page < 5; page++) {
      const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, { headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(15_000) });
      if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, error: "Google rejected the Gemini API key." };
      if (!res.ok) return { ok: false, error: `Google answered HTTP ${res.status} when listing models.` };
      const body = (await res.json()) as { models?: { name?: string }[]; nextPageToken?: string };
      for (const m of body.models ?? []) if (typeof m.name === "string") ids.push(m.name.replace(/^models\//, ""));
      if (!body.nextPageToken) break;
      pageToken = body.nextPageToken;
    }
  } catch {
    return { ok: false, error: "Could not reach Google to list models." };
  }
  return ids.length ? { ok: true, ids } : { ok: false, error: "Google returned an empty model list." };
}

export interface VideoModelStatus {
  omni: boolean;
  veo: string[];
}

export function videoModelStatus(ids: readonly string[], omniModel = VIDEO_MODEL_REPLACEMENT): VideoModelStatus {
  return { omni: ids.includes(omniModel), veo: ids.filter((i) => /^veo-/.test(i)).sort() };
}
