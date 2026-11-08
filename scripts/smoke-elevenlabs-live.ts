/**
 * LIVE smoke test of the ElevenLabs agent client against the real API, with the key saved in Platform Console (read-only DB lookup).
 * Creates ONE temporary agent named "zz-smoke-<time>" and deletes it at the end. Prints no secrets.
 * Run: npx tsx --require ./scripts/lib/next-server-shims.cjs --env-file=.env.local scripts/smoke-elevenlabs-live.ts
 */
import { getConfig } from "@/lib/platform/config/store";
import { forEachCompany } from "@/lib/platform/tenancy/context";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { createAgentClient, buildAgentPayload } from "@/lib/products/agentos/voice/elevenlabs-agent";

async function main() {
  let apiKey = await getConfig("ELEVENLABS_API_KEY");
  if (!apiKey) {
    // read-only: the first company that has an ElevenLabs connection (its own, or the platform fallback)
    const found = await forEachCompany(async () => (await connectionValues("elevenlabs"))?.apiKey ?? null);
    apiKey = found.find((r) => r.ok && r.result)?.result ?? null;
  }
  if (!apiKey) throw new Error("No ElevenLabs key found in Platform Console or any company's saved connection.");
  const c = createAgentClient({ apiKey });
  const step = async <T>(name: string, f: () => Promise<T>): Promise<T | null> => {
    try { const r = await f(); console.log("OK  ", name); return r; } catch (e) { console.log("FAIL", name, "→", e instanceof Error ? e.message : e); return null; }
  };
  const langs = await step("listLanguages", () => c.listLanguages());
  console.log("     languages:", langs?.length ?? 0, langs?.slice(0, 5).map((l) => l.id).join(","));
  const vres = await step("voices", async () => { const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": apiKey } }); if (!r.ok) throw new Error(String(r.status)); return (await r.json()) as { voices: { voice_id: string; name: string }[] }; });
  const voice = vres?.voices?.[0];
  console.log("     voices:", vres?.voices?.length ?? 0);
  if (!voice || !langs?.length) return;
  const want = process.env.SMOKE_LANG ?? "en"; const lang = langs.find((l) => l.id === want)?.id ?? langs[0].id; console.log("     language used:", lang);
  const input = { name: `zz-smoke-${Date.now()}`, instructions: "You are a test agent. Reply in one short sentence.", firstMessage: "Hello, this is a test.", language: lang, voiceId: voice.voice_id, maxDurationSecs: 60, knowledge: [] as { id: string; name: string }[] };
  const doc = await step("createKnowledgeText", () => c.createKnowledgeText("zz-smoke-doc", "The smoke test company opens at nine."));
  if (doc) input.knowledge = [doc];
  const created = await step("createAgent", () => c.createAgent(buildAgentPayload(input)));
  if (created) {
    await step("updateAgent (change first message, full payload)", () => c.updateAgent(created.agentId, buildAgentPayload({ ...input, firstMessage: "Updated greeting." })));
    const raw = await step("verify update stuck", async () => { const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${created.agentId}`, { headers: { "xi-api-key": apiKey } }); const j = (await r.json()) as { conversation_config?: { agent?: { first_message?: string; prompt?: { knowledge_base?: unknown[] } } } }; if (j.conversation_config?.agent?.first_message !== "Updated greeting.") throw new Error("first_message not updated"); return j; });
    console.log("     knowledge attached:", raw?.conversation_config?.agent?.prompt?.knowledge_base?.length ?? 0);
    const url = await step("getSignedUrl", () => c.getSignedUrl(created.agentId));
    console.log("     signed url is wss:", !!url && url.startsWith("wss://"));
    await step("listConversations", () => c.listConversations(created.agentId));
    await step("deleteAgent", () => c.deleteAgent(created.agentId));
  }
  if (doc) await step("deleteKnowledgeDoc", () => c.deleteKnowledgeDoc(doc.id));
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
