"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Mail, Globe, TriangleAlert } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ConfigSource, FieldView, IntegrationsInput, IntegrationsView, SecretView } from "@/lib/platform/integrations";
import { saveIntegrationsAction, sendTestEmailAction, testDomainProviderAction } from "./actions";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";

const SOURCE_LABEL: Record<ConfigSource, string> = { db: "saved here", env: "from environment", default: "default" };

function Effective({ field, empty = "not set" }: { field: FieldView; empty?: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      In use: <span className="font-medium text-foreground">{field.effective || empty}</span> ({SOURCE_LABEL[field.source]})
    </p>
  );
}

function SecretStatus({ id, secret }: { id: string; secret: SecretView }) {
  return (
    <p id={id} className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <KeyRound className="size-3" />
      {secret.source ? (
        <>
          In use: <span className="font-mono text-foreground">••••{secret.last4}</span> ({SOURCE_LABEL[secret.source]})
        </>
      ) : (
        "None configured"
      )}
      {secret.unreadable && (
        <span className="inline-flex items-center gap-1 text-destructive">
          <TriangleAlert className="size-3" /> The saved value can&apos;t be decrypted — re-enter it.
        </span>
      )}
    </p>
  );
}

type Message = { ok: boolean; text: string } | null;

export default function IntegrationsForm({ view, adminEmail }: { view: IntegrationsView; adminEmail: string }) {
  const router = useRouter();
  const [v, setV] = useState<IntegrationsInput>({
    email: { provider: view.email.provider.saved as IntegrationsInput["email"]["provider"], apiKey: "", clearApiKey: false, from: view.email.from.saved },
    domains: {
      provider: view.domains.provider.saved as IntegrationsInput["domains"]["provider"],
      token: "",
      clearToken: false,
      projectId: view.domains.projectId.saved,
      teamId: view.domains.teamId.saved,
      rootDomain: view.domains.rootDomain.saved,
    },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const [emailTest, setEmailTest] = useState<Message>(null);
  const [domainTest, setDomainTest] = useState<Message>(null);

  const setEmail = <K extends keyof IntegrationsInput["email"]>(k: K, value: IntegrationsInput["email"][K]) => {
    setSaved(false);
    setV((p) => ({ ...p, email: { ...p.email, [k]: value } }));
  };
  const setDomains = <K extends keyof IntegrationsInput["domains"]>(k: K, value: IntegrationsInput["domains"][K]) => {
    setSaved(false);
    setV((p) => ({ ...p, domains: { ...p.domains, [k]: value } }));
  };
  const err = (key: string) => (errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    start(async () => {
      const res = await saveIntegrationsAction(v);
      if (res.ok) {
        setErrors({});
        setSaved(true);
        router.refresh();
      } else setErrors(res.errors);
    });
  }

  function test(kind: "email" | "domains") {
    (kind === "email" ? setEmailTest : setDomainTest)(null);
    startTest(async () => {
      const res = kind === "email" ? await sendTestEmailAction() : await testDomainProviderAction();
      (kind === "email" ? setEmailTest : setDomainTest)(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
    });
  }

  return (
    <form className="space-y-4" onSubmit={save}>
      {!view.encryptionConfigured && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          PLATFORM_ENCRYPTION_KEY isn&apos;t set on the server, so API keys can&apos;t be saved here yet. Other settings still save, and credentials from the environment keep working.
        </p>
      )}

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4 text-primary" /> Email
          </CardTitle>
          <CardDescription>Sign-up, invitation, billing and every other email the platform sends.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="int-email-provider">Provider</Label>
            <select id="int-email-provider" className={selectClass} value={v.email.provider} onChange={(e) => setEmail("provider", e.target.value as IntegrationsInput["email"]["provider"])}>
              <option value="">Automatic (environment / default)</option>
              <option value="resend">Resend</option>
              <option value="console">Console (log only, no sending)</option>
            </select>
            <Effective field={view.email.provider} />
            {err("email.provider")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="int-email-from">From address</Label>
            <Input id="int-email-from" value={v.email.from} onChange={(e) => setEmail("from", e.target.value)} placeholder="Your Company <no-reply@yourdomain.com>" />
            <Effective field={view.email.from} />
            {err("email.from")}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="int-resend-key">Resend API key</Label>
            <Input
              id="int-resend-key"
              type="password"
              autoComplete="off"
              value={v.email.apiKey}
              onChange={(e) => setEmail("apiKey", e.target.value)}
              placeholder={view.email.apiKey.saved ? "Leave blank to keep the saved key" : "re_…"}
              disabled={!view.encryptionConfigured}
            />
            <SecretStatus id="int-resend-key-status" secret={view.email.apiKey} />
            {view.email.apiKey.saved && (
              <label className="flex items-center gap-2 text-sm">
                <input id="int-resend-clear" type="checkbox" className="size-4 accent-primary" checked={v.email.clearApiKey} onChange={(e) => setEmail("clearApiKey", e.target.checked)} />
                Remove the saved key (fall back to the environment)
              </label>
            )}
            {err("email.apiKey")}
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button id="int-test-email" type="button" variant="outline" onClick={() => test("email")} disabled={testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : "Send test email"}
            </Button>
            <span className="text-xs text-muted-foreground">Goes to {adminEmail}, using the saved settings.</span>
            {emailTest && (
              <p className={emailTest.ok ? "w-full text-sm text-emerald-600" : "w-full text-sm text-destructive"} aria-live="polite">
                {emailTest.text}
              </p>
            )}
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4 text-primary" /> Domains &amp; hosting
          </CardTitle>
          <CardDescription>Where company subdomains and custom domains are attached for routing and SSL.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="int-domain-provider">Provider</Label>
            <select id="int-domain-provider" className={selectClass} value={v.domains.provider} onChange={(e) => setDomains("provider", e.target.value as IntegrationsInput["domains"]["provider"])}>
              <option value="">Automatic (environment / default)</option>
              <option value="vercel">Vercel</option>
              <option value="manual">Manual (attached by the operator)</option>
            </select>
            <Effective field={view.domains.provider} />
            {err("domains.provider")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="int-root-domain">Root domain</Label>
            <Input id="int-root-domain" value={v.domains.rootDomain} onChange={(e) => setDomains("rootDomain", e.target.value)} placeholder="example.com" />
            <Effective field={view.domains.rootDomain} />
            <p className="text-xs text-muted-foreground">New companies get &lt;slug&gt;.root. Existing addresses aren&apos;t moved.</p>
            {err("domains.rootDomain")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="int-vercel-project">Vercel project id</Label>
            <Input id="int-vercel-project" value={v.domains.projectId} onChange={(e) => setDomains("projectId", e.target.value)} placeholder="prj_…" />
            <Effective field={view.domains.projectId} />
            {err("domains.projectId")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="int-vercel-team">Vercel team id (optional)</Label>
            <Input id="int-vercel-team" value={v.domains.teamId} onChange={(e) => setDomains("teamId", e.target.value)} placeholder="team_…" />
            <Effective field={view.domains.teamId} empty="none" />
            {err("domains.teamId")}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="int-vercel-token">Vercel API token</Label>
            <Input
              id="int-vercel-token"
              type="password"
              autoComplete="off"
              value={v.domains.token}
              onChange={(e) => setDomains("token", e.target.value)}
              placeholder={view.domains.token.saved ? "Leave blank to keep the saved token" : "Token with access to the project"}
              disabled={!view.encryptionConfigured}
            />
            <SecretStatus id="int-vercel-token-status" secret={view.domains.token} />
            {view.domains.token.saved && (
              <label className="flex items-center gap-2 text-sm">
                <input id="int-vercel-clear" type="checkbox" className="size-4 accent-primary" checked={v.domains.clearToken} onChange={(e) => setDomains("clearToken", e.target.checked)} />
                Remove the saved token (fall back to the environment)
              </label>
            )}
            {err("domains.token")}
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button id="int-test-vercel" type="button" variant="outline" onClick={() => test("domains")} disabled={testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : "Test connection"}
            </Button>
            <span className="text-xs text-muted-foreground">Read-only: reads the project, changes nothing.</span>
            {domainTest && (
              <p className={domainTest.ok ? "w-full text-sm text-emerald-600" : "w-full text-sm text-destructive"} aria-live="polite">
                {domainTest.text}
              </p>
            )}
          </div>
        </CardContent>
      </GlassCard>

      <div className="flex flex-wrap items-center gap-3">
        <Button id="int-save" type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Save integrations"}
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600" aria-live="polite">
            Saved.
          </span>
        )}
        {Object.keys(errors).length > 0 && (
          <span className="text-sm text-destructive" aria-live="polite">
            Fix the highlighted fields.
          </span>
        )}
      </div>
    </form>
  );
}
