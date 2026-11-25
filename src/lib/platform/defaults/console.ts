import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { listActiveCompanyIds } from "@/lib/platform/tenancy/companies";
import { CONNECTIONS_COLLECTION } from "@/lib/platform/connections/store";
import { platformSendgrid, platformSmtp } from "@/lib/platform/email/platform-accounts";
import { resolveEmailConfig } from "@/lib/platform/integrations/resolve";
import { platformServiceReady } from "@/lib/platform/connections/platform-services";
import { fromEnv } from "@/lib/platform/connections/resolve";
import { runTester, type TestOutcome, type TesterDeps, defaultDeps } from "@/lib/platform/connections/testers";
import { getConfig, getConfigs } from "@/lib/platform/config/store";
import { resolveDomainConfig } from "@/lib/platform/integrations/resolve";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { PLATFORM_CARDS, platformCard, type CardFacts, type PlatformCardDef } from "@/lib/platform/defaults/console-cards";

/** The server side of Platform Console → Integrations: is each default in place, who uses it, and does it work. Never returns a secret. */

/** The company providers that make a company "use its own" for a card (any of the email providers counts for the platform email default). */
const EMAIL = ["smtp", "resend", "sendgrid"];
const OWN_PROVIDERS = (key: string): string[] => (EMAIL.includes(key) ? EMAIL : [key]);
/** Cards whose default is a company connection (storage and domains are platform infrastructure, not a per-company choice). */
const hasUsage = (c: PlatformCardDef) => c.kind === "default" && c.key !== "storage" && c.key !== "domains";

/** Per card: how many active companies use the platform default and how many saved their own and use it. */
export async function defaultUsage(): Promise<Record<string, { usingDefault: number; usingOwn: number }>> {
  // One aggregation over every active company's saved connections (platform-level count: provider names only, no values are read). Scoped rows are keyed `<companyId>::<provider>`.
  const ids = await listActiveCompanyIds();
  const rows = await (await getPlatformDb())
    .collection(CONNECTIONS_COLLECTION)
    .aggregate<{ _id: string; providers: string[] }>([
      { $match: { companyId: { $in: ids }, mode: { $ne: "srb" } } },
      { $group: { _id: "$companyId", providers: { $addToSet: { $arrayElemAt: [{ $split: ["$_id", "::"] }, -1] } } } },
    ])
    .toArray();
  return Object.fromEntries(PLATFORM_CARDS.filter(hasUsage).map((c) => {
    const usingOwn = rows.filter((r) => OWN_PROVIDERS(c.key).some((p) => r.providers.includes(p))).length;
    return [c.key, { usingOwn, usingDefault: ids.length - usingOwn }];
  }));
}

async function isConfigured(c: PlatformCardDef): Promise<boolean> {
  if (c.kind === "company-only" || c.kind === "not-available") return false;
  if (c.key === "domains") return resolveDomainConfig().then((d) => d.provider === "vercel").catch(() => false);
  if (c.key === "storage") return true; // files are kept in the database unless Blob is chosen
  if (c.key === "smtp") return Boolean(await platformSmtp());
  if (c.key === "sendgrid") return Boolean(await platformSendgrid());
  if (c.key === "resend") return resolveEmailConfig().then((e) => e.provider === "resend" && Boolean(e.resendApiKey));
  if (c.kind === "default") return platformServiceReady(c.key);
  return Boolean(await getConfig(c.panel.keys![0]));
}

export async function consoleFacts(): Promise<Record<string, CardFacts>> {
  const usage = await defaultUsage();
  return Object.fromEntries(await Promise.all(PLATFORM_CARDS.map(async (c) => [c.key, { configured: await isConfigured(c).catch(() => false), usage: usage[c.key] ?? null }] as const)));
}

/** Checks the platform's own saved values for one card with the shared testers (read-only calls), and audits that it was done. */
export async function testPlatformDefault(cardKey: string, actorId: string, deps: TesterDeps = defaultDeps()): Promise<TestOutcome> {
  const card = platformCard(cardKey);
  if (!card?.tester) return { ok: false, message: "There is no test for this card." };
  let values: Record<string, string> | null;
  if (card.tester === "vapid") {
    const c = await getConfigs(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);
    values = c.VAPID_PUBLIC_KEY && c.VAPID_PRIVATE_KEY ? { publicKey: c.VAPID_PUBLIC_KEY, privateKey: c.VAPID_PRIVATE_KEY, subject: c.VAPID_SUBJECT ?? "" } : null;
  } else if (card.tester === "smtp") values = (await platformSmtp())?.values ?? null;
  else if (card.tester === "sendgrid") { const s = await platformSendgrid(); values = s ? { apiKey: s.apiKey } : null; }
  else values = await fromEnv(card.tester);
  const outcome = values ? await runTester(card.tester, values, deps) : { ok: false, message: "Nothing is saved for this service yet." };
  await recordPlatformAudit({ actorId, action: "settings.integrations.test", target: { type: "platform_settings", id: card.key }, details: { ok: outcome.ok } });
  return outcome;
}
