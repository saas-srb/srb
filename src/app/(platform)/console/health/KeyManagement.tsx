"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import ReAuthGate from "@/components/security/ReAuthGate";
import { addPreviousKeyAction, resetCompanyTwoStepAction, revealKeyAction, rotateKeyAction, setPassphraseAction } from "./actions";
import type { KeyHealth } from "@/lib/platform/keyring/manage";

/** Encryption key management: health, add a previous key, one-time backup reveal, recovery passphrase, rotation, and a staff reset of someone's two-step. */
export default function KeyManagement({ health, isOwner, canResetUsers }: { health: KeyHealth; isOwner: boolean; canResetUsers: boolean }) {
  const [pending, start] = useTransition();
  const [prevKey, setPrevKey] = useState("");
  const [pass, setPass] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? ok);
      else toast.error(r.error ?? "Failed");
    });

  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">Encryption keys</CardTitle>
        <CardDescription>
          {health.state === "ok" ? `${health.versions.length} key version(s). ${health.unopenable ? `${health.unopenable} of ${health.testable} checked secret(s) can't be opened by any key: ${health.unopenableWhere.join(", ")}.` : `All ${health.testable} checked secret(s) open.`}` : `Keyring state: ${health.state}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ul className="text-xs text-muted-foreground">
          {health.versions.map((v) => (
            <li key={v.id}>v{v.version} · {v.id} · {v.status} · {v.verification}</li>
          ))}
        </ul>
        {health.rotation && <p className="text-xs text-muted-foreground">Rotation: {health.rotation.finished ? "finished" : `re-sealing, ${health.rotation.resealed} done, ${health.rotation.remaining} remaining`}.</p>}
        {isOwner && (
          <ReAuthGate title="Confirm it's you to manage encryption keys">
            <div className="space-y-2 border-t pt-3">
              <p className="font-medium">Add previous encryption key</p>
              <Input type="password" autoComplete="off" placeholder="The original PLATFORM_ENCRYPTION_KEY (base64)" value={prevKey} onChange={(e) => setPrevKey(e.target.value)} />
              <Button size="sm" variant="outline" disabled={pending || !prevKey} onClick={() => run(async () => { const r = await addPreviousKeyAction({ key: prevKey }); if (r.ok) setPrevKey(""); return r.ok ? { ok: true, message: `Added: it opens ${r.opened} stored secret(s) and is now the active key.` } : r; }, "Added")}>Add key</Button>
            </div>
            <div className="space-y-2 border-t pt-3">
              <p className="font-medium">Encryption key backup</p>
              <p className="text-xs text-muted-foreground">Shows the active key once. Keep it in a password manager; whoever has it and the database can read the encrypted data.{health.backedUpAt ? ` Last shown ${new Date(health.backedUpAt).toLocaleString()}.` : " Never shown yet."}</p>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await revealKeyAction(); if (r.ok) setShown(r.key); else toast.error(r.error); })}>Show the key once</Button>
              {shown && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="break-all font-mono text-xs">{shown}</p>
                  <p className="mt-1 text-xs">Copy it now. It will not be shown again here.</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(shown).then(() => toast.success("Copied"))}>Copy</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShown(null)}>Hide</Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Optional recovery passphrase: an extra copy of the keys sealed with it, so a changed database URI can be healed with <code>npm run key:rewrap</code>. {health.passphraseSet ? (health.passphraseStale ? "Set, but keys changed since: set it again." : "Set.") : "Not set."}</p>
              <div className="flex gap-2">
                <Input type="password" autoComplete="off" placeholder="Recovery passphrase (12+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} />
                <Button size="sm" variant="outline" disabled={pending || pass.length < 12} onClick={() => run(async () => { const r = await setPassphraseAction({ passphrase: pass }); if (r.ok) setPass(""); return r; }, "Passphrase saved")}>Save</Button>
              </div>
            </div>
            <div className="space-y-2 border-t pt-3">
              <p className="font-medium">Rotate encryption key</p>
              <p className="text-xs text-muted-foreground">Creates a fresh random key as the active key. All older keys stay (decrypt only) and stored secrets are re-sealed in the background (also by the daily job). Show and keep the new key afterwards.</p>
              <Button size="sm" disabled={pending} onClick={() => run(() => rotateKeyAction(), "A new key is active; re-sealing has started.")}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : "Rotate key"}</Button>
            </div>
          </ReAuthGate>
        )}
        {canResetUsers && (
          <div className="space-y-2 border-t pt-3">
            <p className="font-medium">Reset someone&apos;s two-step sign-in</p>
            <p className="text-xs text-muted-foreground">For a company admin who can&apos;t use their authenticator. Audited; they get an email and set it up again at their next sign-in.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Company slug or id" value={company} onChange={(e) => setCompany(e.target.value)} />
              <Input type="email" placeholder="Person's email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" disabled={pending || !company || !email} onClick={() => run(() => resetCompanyTwoStepAction({ company, email }), "Reset")}>Reset two-step</Button>
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
