import { opensSample, type CipherSample, type Sealed } from "@/lib/platform/keyring/probe";

/**
 * `npm run twofactor:doctor`: finds people whose two-step (authenticator) secret can't be opened by ANY key in the keyring, and, only with
 * an explicit flag and a typed confirmation, clears just those two-step fields. Pure over small interfaces so it is tested with fakes.
 * It never touches anyone whose secret opens with any key, and refuses when the keyring is locked or has no verified key.
 */

export interface DoctorUser {
  companyId: string;
  companyName: string;
  adminId: string;
  email: string;
  twoFactor?: { secret: Sealed } | null;
  twoFactorPending?: { secret: Sealed } | null;
}

export interface DoctorDeps {
  dbName: string;
  keyring: { state: "ok" | "locked" | "missing"; keys: { key: Buffer; verified: boolean }[] };
  users(): Promise<DoctorUser[]>;
  writeBackup(rows: unknown[]): Promise<string>;
  clear(u: DoctorUser): Promise<boolean>;
  audit(entry: { action: string; details: Record<string, unknown> }): Promise<void>;
  notify(u: DoctorUser): Promise<boolean>;
  confirm(prompt: string): Promise<string>;
  log(line: string): void;
}

export const maskEmail = (e: string) => {
  const [n, d] = e.split("@");
  return d ? `${n.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(n.length - 1, 6)))}@${d}` : "***";
};

export function isReadable(u: DoctorUser, keys: Buffer[]): boolean {
  const aad = `2fa:${u.companyId}:${u.adminId}`;
  const sealed = [u.twoFactor?.secret, u.twoFactorPending?.secret].filter((s): s is Sealed => !!s);
  if (sealed.length === 0) return true; // nothing encrypted: nothing to repair
  return sealed.every((enc) => keys.some((k) => opensSample(k, { enc, aad, where: "" } as CipherSample)));
}

export async function runDoctor(deps: DoctorDeps, opts: { apply: boolean; confirmDb?: string }): Promise<{ ok: boolean; refused?: string; unreadable: number; cleared: number }> {
  if (deps.keyring.state !== "ok") return { ok: false, refused: deps.keyring.state === "locked" ? "The keyring is locked (the database URI or SAAS_HOSTS differ from the ones it was sealed with). Nothing was changed. Run `npm run key:rewrap` first." : "There is no keyring in this database.", unreadable: 0, cleared: 0 };
  if (!deps.keyring.keys.some((k) => k.verified)) return { ok: false, refused: "No verified key exists (no key opens any existing encrypted data), so it can't be told who is genuinely unreadable. Nothing was changed. Use the Platform Console reset or the emergency sign-in meanwhile, and get the original key into the keyring.", unreadable: 0, cleared: 0 };
  const keys = deps.keyring.keys.map((k) => k.key);
  const all = await deps.users();
  const bad = all.filter((u) => (u.twoFactor || u.twoFactorPending) && !isReadable(u, keys));
  deps.log(`${all.filter((u) => u.twoFactor || u.twoFactorPending).length} user(s) have two-step; ${bad.length} cannot be opened by any key:`);
  for (const u of bad) deps.log(`  - ${maskEmail(u.email)}  (${u.companyName})`);
  if (!opts.apply) {
    deps.log(bad.length ? "Read-only run: nothing was changed. Re-run with --apply to clear ONLY these people's two-step fields." : "Nothing to repair.");
    return { ok: true, unreadable: bad.length, cleared: 0 };
  }
  if (!bad.length) return { ok: true, unreadable: 0, cleared: 0 };
  const typed = opts.confirmDb ?? (await deps.confirm(`Type the database name (${deps.dbName}) to confirm clearing two-step for ${bad.length} user(s): `));
  if (typed.trim() !== deps.dbName) return { ok: false, refused: "The database name did not match. Nothing was changed.", unreadable: bad.length, cleared: 0 };
  const file = await deps.writeBackup(bad.map((u) => ({ companyId: u.companyId, adminId: u.adminId, email: u.email, twoFactor: u.twoFactor ?? null, twoFactorPending: u.twoFactorPending ?? null })));
  deps.log(`Backup of the removed fields written to ${file}`);
  let cleared = 0;
  for (const u of bad) {
    if (await deps.clear(u)) {
      cleared++;
      await deps.notify(u).catch(() => false);
    }
  }
  await deps.audit({ action: "two_step.doctor_cleared", details: { cleared, users: bad.map((u) => ({ companyId: u.companyId, adminId: u.adminId })), backup: file } });
  deps.log(`Cleared two-step for ${cleared} user(s). They set it up again at their next sign-in.`);
  return { ok: true, unreadable: bad.length, cleared };
}
