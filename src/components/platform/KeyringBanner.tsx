import { ensureKeyring } from "@/lib/platform/keyring";

/** A loud notice when the encryption keyring can't be used (shown above the sign-in form and in the Console). Renders nothing when all is well. */
export default async function KeyringBanner() {
  const s = await ensureKeyring().catch(() => null);
  if (s && s.state === "ok" && (s.mismatch?.unopenable ?? 0) > 0) {
    return (
      <div role="alert" className="mx-auto my-3 max-w-3xl rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <p className="font-semibold">Encryption key mismatch</p>
        <p className="mt-1">{s.mismatch!.unopenable} stored secret(s) (such as two-step authenticator secrets) can&apos;t be opened with the keys this deployment has, so those people can&apos;t use their authenticator here. Nothing is lost and nobody is locked out: they can use a recovery code, and platform staff can reset them.</p>
        <p className="mt-1">To fix it for good, deploy this code once in the project that has the original PLATFORM_ENCRYPTION_KEY (it stores the key safely), or paste the original key in Console, Health, &quot;Add previous encryption key&quot;.</p>
      </div>
    );
  }
  if (!s || s.state === "ok" || s.state === "unavailable") return null;
  return (
    <div role="alert" className="mx-auto my-3 max-w-3xl rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="font-semibold">{s.state === "needs_old_key" ? "Provide the old PLATFORM_ENCRYPTION_KEY once" : "The stored encryption keys can't be opened"}</p>
      <p className="mt-1">{s.message}</p>
      {s.state === "needs_old_key" && <p className="mt-1">Set PLATFORM_ENCRYPTION_KEY (the value from the old deployment) in this project&apos;s environment and redeploy. It is then kept safely in the database and is not needed again.</p>}
    </div>
  );
}
