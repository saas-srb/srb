import assert from "node:assert/strict";
import { disabledHosts, hostIsDisabled, isDeploymentDisabled } from "../src/lib/platform/setup/blocked";

// Run with: npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-host-recovery.ts
let n = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log("  ✓", name); };

(async () => {
  await t("402 with x-vercel-error DEPLOYMENT_DISABLED is recognised; nothing else is", () => {
    assert.equal(isDeploymentDisabled(402, "DEPLOYMENT_DISABLED"), true);
    assert.equal(isDeploymentDisabled(402, null), false);
    assert.equal(isDeploymentDisabled(404, "DEPLOYMENT_DISABLED"), false);
    assert.equal(isDeploymentDisabled(200, "x"), false);
  });
  await t("only hosts that really answer 402 DEPLOYMENT_DISABLED are listed (staff note), unreachable hosts are not", async () => {
    const fetchFn = (async (u: string) => {
      const host = new URL(u).host;
      if (host === "www.yashorbit.com" || host === "app.yashorbit.com") return new Response(null, { status: 402, headers: { "x-vercel-error": "DEPLOYMENT_DISABLED" } });
      if (host === "down.example") throw new Error("ECONNREFUSED");
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const bad = await disabledHosts(["www.yashorbit.com", "app.yashorbit.com", "good.example", "down.example"], fetchFn);
    assert.deepEqual(bad.sort(), ["app.yashorbit.com", "www.yashorbit.com"]);
    assert.equal(await hostIsDisabled("good.example", fetchFn), false);
  });
  console.log(`\n${n} passed`);
})();
