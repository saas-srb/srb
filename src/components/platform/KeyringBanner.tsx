import { ensureKeyring } from "@/lib/platform/keyring";

/** A loud notice when the encryption keyring can't be used (shown above the sign-in form and in the Console). Renders nothing when all is well. */
export default async function KeyringBanner() {
  const s = await ensureKeyring().catch(() => null);
  if (!s || s.state === "ok" || s.state === "unavailable") return null;
  return (
    <div role="alert" className="mx-auto my-3 max-w-3xl rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="font-semibold">{s.state === "needs_old_key" ? "Provide the old PLATFORM_ENCRYPTION_KEY once" : "The stored encryption keys can't be opened"}</p>
      <p className="mt-1">{s.message}</p>
      {s.state === "needs_old_key" && <p className="mt-1">Set PLATFORM_ENCRYPTION_KEY (the value from the old deployment) in this project&apos;s environment and redeploy. It is then kept safely in the database and is not needed again.</p>}
    </div>
  );
}
