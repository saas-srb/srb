import path from "node:path";

/** Used by the build workflow: tells the platform how a build is going. Does nothing when the build was started by hand (no BUILD_ID). */
export async function report(status, extra = {}) {
  const { BUILD_ID, CALLBACK_URL, DESKTOP_BUILD_SECRET, PLATFORM, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!BUILD_ID || !CALLBACK_URL) return;
  const runUrl = GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : undefined;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(CALLBACK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${DESKTOP_BUILD_SECRET}` },
        body: JSON.stringify({ buildId: BUILD_ID, platform: PLATFORM, status, runUrl, ...extra }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return;
      console.error(`Platform answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
      if (res.status < 500 && res.status !== 429) return; // a refusal will not change on retry
    } catch (err) {
      console.error("Could not reach the platform:", err.message);
    }
    await new Promise((r) => setTimeout(r, attempt * 5000));
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [status, ...message] = process.argv.slice(2);
  await report(status, message.length ? { error: message.join(" ") } : {});
}
