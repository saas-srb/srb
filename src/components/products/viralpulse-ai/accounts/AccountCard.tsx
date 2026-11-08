"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Star, Stethoscope, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import StatusBadge from "./StatusBadge";
import ConnectButton from "./ConnectButton";
import { setAccountClientAction, setAccountDefaultAction, setAccountEnabledAction, testAccountAction } from "@/app/(products)/viralpulse-ai/(protected)/settings/accounts/actions";
import { featuresForScopes, type AccountView } from "@/lib/products/viralpulse-ai/accounts/types";
import { formatDateTime } from "@/lib/utils";

const safeImg = (u: string | null) => (u && /^https:\/\//i.test(u) ? u : undefined);

function countdown(a: AccountView): string | null {
  if (!a.expiresAt || a.daysLeft === null) return a.autoRenews ? "Renews itself" : null;
  if (a.status === "expired") return `Expired ${formatDateTime(a.expiresAt)}`;
  const d = a.daysLeft;
  const when = d <= 0 ? "less than a day" : `${d} day${d === 1 ? "" : "s"}`;
  return a.autoRenews ? `Access token renews itself (valid ${when} more)` : `Login expires in ${when} (${formatDateTime(a.expiresAt)}); reconnect before then`;
}

export default function AccountCard({ account: a, showClient }: { account: AccountView; showClient: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [client, setClient] = useState(a.client ?? "");
  const [scopesOpen, setScopesOpen] = useState(false);
  const missing = [...a.missingRequired, ...a.missingOptional.map((m) => m.scope)];
  const fix = () => featuresForScopes(a.oauth, missing);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Could not do that.");
      else {
        toast.success(ok);
        router.refresh();
      }
    });
  }
  function test() {
    start(async () => {
      const r = (await testAccountAction(a.id)) as { ok: boolean; error?: string; passed?: boolean; detail?: string };
      if (!r.ok) toast.error(r.error ?? "The test could not run.");
      else if (r.passed) toast.success(r.detail ?? "The platform answered.");
      else toast.error(r.detail ?? "The platform did not answer.");
      router.refresh();
    });
  }

  return (
    <li className="space-y-2 rounded-xl border border-border/50 bg-background/60 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar className="size-10">
          <AvatarImage src={safeImg(a.avatarUrl)} alt="" referrerPolicy="no-referrer" />
          <AvatarFallback>{a.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{a.name}</p>
            <StatusBadge status={a.status} />
            {a.isDefault && a.enabled && <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary"><Star className="size-3" aria-hidden />Default</span>}
          </div>
          <p className="text-xs text-muted-foreground">{[a.providerLabel, a.handle, a.client ? `Client: ${a.client}` : null].filter(Boolean).join(" · ")}</p>
          {countdown(a) && <p className="mt-0.5 text-[11px] text-muted-foreground">{countdown(a)}</p>}
          {a.lastVerifiedAt && <p className="text-[11px] text-muted-foreground">{`Last checked with the platform ${formatDateTime(a.lastVerifiedAt)}`}</p>}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <input type="checkbox" checked={a.enabled} disabled={pending} onChange={(e) => act(() => setAccountEnabledAction(a.id, e.target.checked), e.target.checked ? "Account enabled" : "Account disabled")} />
          {a.enabled ? "Enabled" : "Disabled"}
        </label>
      </div>

      {a.lastError && <p className="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />{a.lastError}</p>}

      {a.missingRequired.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
          <p className="font-semibold text-amber-900 dark:text-amber-200">{`Missing: ${a.missingRequired.join(", ")}`}</p>
          <p className="text-muted-foreground">This account cannot publish until the platform grants it. Reconnect and tick every permission in the platform&apos;s dialog.</p>
          <div className="mt-1"><ConnectButton oauth={a.oauth} connectionId={a.connectionId} label="Fix permissions" variant="outline" fix={a.missingRequired} className="inline-block" /></div>
        </div>
      )}
      {a.missingRequired.length === 0 && a.missingOptional.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {`Not granted: ${a.missingOptional.map((m) => `${m.scope} (${m.why})`).join("; ")}. `}
          <a className="font-medium text-primary underline" href={`/api/viralpulse-ai/oauth/${a.oauth}?reconnect=${encodeURIComponent(a.connectionId)}&features=${fix().join(",")}&fix=${encodeURIComponent(a.missingOptional.map((m) => m.scope).join(","))}`}>Grant</a>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" variant="outline" disabled={pending} onClick={test}>{pending ? <Loader2 className="size-3 animate-spin" /> : <Stethoscope className="size-3" />} Test connection</Button>
        {a.enabled && !a.isDefault && <Button size="xs" variant="ghost" disabled={pending} onClick={() => act(() => setAccountDefaultAction(a.id), "Default account changed")}>Make default</Button>}
        {(a.status === "expired" || a.status === "revoked" || a.status === "expiring") && <ConnectButton oauth={a.oauth} connectionId={a.connectionId} variant="outline" className="inline-block" />}
        <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => setScopesOpen((o) => !o)}>{scopesOpen ? "Hide permissions" : `Permissions (${a.scopes.length})`}</button>
      </div>
      {scopesOpen && (
        <ul className="flex flex-wrap gap-1">
          {a.scopes.length === 0 ? <li className="text-[11px] text-muted-foreground">The platform did not list any permissions.</li> : a.scopes.map((s) => <li key={s} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{s.replace("https://www.googleapis.com/auth/", "")}</li>)}
        </ul>
      )}

      {showClient && (
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); act(() => setAccountClientAction(a.id, client), "Client label saved"); }}>
          <Input value={client} onChange={(e) => setClient(e.target.value)} maxLength={80} placeholder="Client (optional, for agencies)" className="h-8 max-w-xs text-xs" aria-label={`Client for ${a.name}`} />
          <Button size="xs" variant="ghost" type="submit" disabled={pending || client === (a.client ?? "")}>Save</Button>
        </form>
      )}
    </li>
  );
}
