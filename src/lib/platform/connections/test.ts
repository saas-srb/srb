import "server-only";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { recordTestResult } from "@/lib/platform/connections/store";
import { probeStorage, pingWebhooks, runTester, sendTestEmailToPerson, type TestOutcome } from "@/lib/platform/connections/testers";

export type { TestOutcome } from "@/lib/platform/connections/testers";

/**
 * "Test connection" for the CURRENT workspace: one entry point per card. Credentials-based services run the shared tester
 * (`testers.ts`) against the connection that is really in use (the company's own keys, else SRB's); the services managed on their own
 * pages (payments, file storage, webhooks) run their own safe check. The result is remembered on the connection.
 */
export async function testConnection(provider: string): Promise<TestOutcome> {
  let outcome: TestOutcome;
  try {
    outcome = await runFor(provider);
  } catch (err) {
    outcome = { ok: false, message: `Check failed: ${err instanceof Error ? err.message.slice(0, 160) : "unknown error"}.` };
  }
  await recordTestResult(provider, outcome.ok, outcome.message).catch(() => {});
  return outcome;
}

async function runFor(provider: string): Promise<TestOutcome> {
  switch (provider) {
    case "razorpay": {
      const { testPaymentAccount } = await import("@/lib/platform/integrations/payments");
      const r = await testPaymentAccount();
      return r.ok ? { ok: true, message: r.message ?? "Connected to Razorpay." } : { ok: false, message: r.error };
    }
    case "storage": {
      const { storeBytes, getObject, deleteObject } = await import("@/lib/storage/blob");
      return probeStorage({
        put: (key, body) => storeBytes(key, body, "text/plain"),
        get: async (key) => {
          const got = await getObject(key);
          if (!got) return null;
          const chunks: Buffer[] = [];
          for await (const c of got.stream as unknown as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(c));
          return Buffer.concat(chunks);
        },
        remove: (key) => deleteObject(key),
      });
    }
    case "webhooks": {
      const [{ listWorkflows }, { deliverWebhook }] = await Promise.all([import("@/lib/platform/workflows"), import("@/lib/platform/workflows/webhook")]);
      const flows = await listWorkflows();
      const targets = flows.flatMap((w) => w.actions.filter((a): a is Extract<typeof a, { type: "webhook" }> => a.type === "webhook").map((a) => ({ name: w.name, url: a.url, secret: w.secret })));
      return pingWebhooks(targets.slice(0, 5), (url, payload, opts) => deliverWebhook(url, payload, opts));
    }
    default: {
      const values = await connectionValues(provider);
      if (!values) return { ok: false, message: "Nothing is connected for this service yet." };
      return runTester(provider, values);
    }
  }
}

/** "Send me a test email": through the sending account really in use, to the signed-in person's own address only. */
export async function sendTestEmailToMe(person: { email: string | null | undefined }): Promise<TestOutcome> {
  const { sendEmail } = await import("@/lib/platform/email");
  return sendTestEmailToPerson(person.email, {
    send: async (to, subject, text) => {
      const r = await sendEmail({ to, subject, text, html: `<p>${text}</p>` });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
  });
}
