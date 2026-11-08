"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { saveSettingsAction, testIntegrationAction } from "@/app/(products)/rankmax-ai/(protected)/actions";

export type SettingsValues = Record<string, string | boolean>;

function Section({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-4 space-y-3 rounded-2xl border border-border/40 bg-card/90 p-4">
      <div>
        <p className="text-sm font-bold">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function SeoSettingsForm({ initial, siteUrl, env }: { initial: SettingsValues; /** The company's public site, for placeholders. */ siteUrl: string; env: { serviceAccount: string | null; pagespeedKey: boolean; gscLastSync: string | null; gscError: string | null; ga4LastSync: string | null; ga4Error: string | null } }) {
  const router = useRouter();
  const [v, setV] = useState<SettingsValues>(initial);
  const [pending, startTransition] = useTransition();
  const [testing, setTesting] = useState<"gsc" | "ga4" | null>(null);
  const txt = (k: string) => ({ value: String(v[k] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value })) });
  const chk = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={!!v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.checked }))} />
      {label}
    </label>
  );
  const num = (k: string, label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`s-${k}`} className="text-xs">{label}</Label>
      <Input id={`s-${k}`} type="number" {...txt(k)} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  async function test(which: "gsc" | "ga4") {
    setTesting(which);
    const res = await testIntegrationAction(which);
    setTesting(null);
    if (!res.ok) toast.error(res.error);
    else if (res.success) toast.success(res.message);
    else toast.error(res.message);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await saveSettingsAction(v);
          if (!res.ok) toast.error(res.error);
          else {
            toast.success("Settings saved");
            router.refresh();
          }
        });
      }}
    >
      <Section title="Website" description="The origin the crawler audits. Keep production for live audits; point at a staging or local server to audit before deploying.">
        <div className="max-w-md space-y-1.5"><Label htmlFor="s-origin" className="text-xs">Site origin</Label><Input id="s-origin" {...txt("siteOrigin")} placeholder={siteUrl} /></div>
      </Section>

      <Section title="Crawl" description="Scope and politeness of the website audit.">
        <div className="grid gap-3 sm:grid-cols-4">
          {num("maxPages", "Max pages", "10–2000")}
          {num("concurrency", "Parallel requests", "1–10")}
          {num("timeoutMs", "Timeout per page (ms)")}
          {num("maxExternalChecks", "Max external links checked")}
        </div>
        {chk("checkExternalLinks", "Check external links for 404s")}
        <div className="space-y-1.5"><Label htmlFor="s-ex" className="text-xs">Excluded path prefixes (one per line)</Label><Textarea id="s-ex" rows={4} {...txt("excludePrefixes")} className="font-mono text-xs" /></div>
      </Section>

      <Section title="Audit thresholds" description="Limits the on-page and content checks use.">
        <div className="grid gap-3 sm:grid-cols-4">
          {num("titleMin", "Title min chars")}
          {num("titleMax", "Title max chars")}
          {num("descriptionMin", "Description min chars")}
          {num("descriptionMax", "Description max chars")}
          {num("thinContentWords", "Thin content below (words)")}
          {num("slowResponseMs", "Slow response above (ms)")}
          {num("staleContentDays", "Stale after (days)")}
          {num("minInternalLinksIn", "Min incoming internal links")}
        </div>
      </Section>

      <Section title="Schedule" description="Runs from the daily SEO cron (needs CRON_SECRET on the server).">
        <div className="w-48 space-y-1.5"><Label className="text-xs">Automatic website audit</Label><OptionSelect value={String(v.auditFrequency)} onChange={(x) => setV((s) => ({ ...s, auditFrequency: x }))} options={[{ value: "off", label: "Off" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }]} aria-label="Audit frequency" /></div>
        {chk("syncSearchData", "Sync Search Console & Analytics daily (when enabled below)")}
        {chk("verifyBacklinks", "Re-verify all backlinks every Monday")}
      </Section>

      <Section title="Keyword defaults" description="Used when a keyword is added or imported without these fields.">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5"><Label className="text-xs">Country (ISO-2)</Label><Input {...txt("defaultCountry")} maxLength={2} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Language</Label><Input {...txt("defaultLanguage")} maxLength={5} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Device</Label><OptionSelect value={String(v.defaultDevice)} onChange={(x) => setV((s) => ({ ...s, defaultDevice: x }))} options={[{ value: "desktop", label: "Desktop" }, { value: "mobile", label: "Mobile" }]} aria-label="Device" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Search engine</Label><Input {...txt("defaultEngine")} /></div>
        </div>
      </Section>

      <Section id="integrations" title="Integrations" description="Google APIs use one service account whose credentials live in server environment variables (GOOGLE_SEO_CLIENT_EMAIL / GOOGLE_SEO_PRIVATE_KEY, falling back to the Indexing API account). Nothing secret is stored in the database.">
        <div className="rounded-xl bg-muted/50 p-3 text-xs">
          {env.serviceAccount ? (
            <>Service account: <code className="font-mono">{env.serviceAccount}</code> — add it as a <strong>user</strong> on the Search Console property and as a <strong>Viewer</strong> on the GA4 property.</>
          ) : (
            <span className="text-amber-700 dark:text-amber-300">No Google service-account credentials are configured on the server, so Search Console and Analytics can&apos;t connect yet.</span>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2 rounded-xl border border-border/40 p-3">
            <p className="text-sm font-semibold">Google Search Console</p>
            {chk("gscEnabled", "Enabled")}
            <div className="space-y-1.5"><Label className="text-xs">Property</Label><Input {...txt("gscProperty")} placeholder={`sc-domain:${new URL(siteUrl).hostname}`} /></div>
            <p className="text-[11px] text-muted-foreground">{env.gscLastSync ? `Last sync ${env.gscLastSync}` : "Never synced"}{env.gscError && <span className="block text-rose-600">{env.gscError}</span>}</p>
            <Button type="button" size="sm" variant="outline" disabled={!env.serviceAccount || testing !== null} onClick={() => test("gsc")}>{testing === "gsc" ? <Loader2 className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" data-icon="inline-start" />}Test connection</Button>
          </div>
          <div className="space-y-2 rounded-xl border border-border/40 p-3">
            <p className="text-sm font-semibold">Google Analytics 4</p>
            {chk("ga4Enabled", "Enabled (organic sessions only)")}
            <div className="space-y-1.5"><Label className="text-xs">Property id (numeric)</Label><Input {...txt("ga4PropertyId")} placeholder="123456789" /></div>
            <p className="text-[11px] text-muted-foreground">{env.ga4LastSync ? `Last sync ${env.ga4LastSync}` : "Never synced"}{env.ga4Error && <span className="block text-rose-600">{env.ga4Error}</span>}</p>
            <Button type="button" size="sm" variant="outline" disabled={!env.serviceAccount || testing !== null || !v.ga4PropertyId} onClick={() => test("ga4")}>{testing === "ga4" ? <Loader2 className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" data-icon="inline-start" />}Test connection</Button>
          </div>
          <div className="space-y-2 rounded-xl border border-border/40 p-3">
            <p className="text-sm font-semibold">PageSpeed Insights</p>
            {chk("psiEnabled", "Enabled")}
            <div className="space-y-1.5"><Label className="text-xs">Strategy</Label><OptionSelect value={String(v.psiStrategy)} onChange={(x) => setV((s) => ({ ...s, psiStrategy: x }))} options={[{ value: "mobile", label: "Mobile" }, { value: "desktop", label: "Desktop" }]} aria-label="Strategy" /></div>
            <p className="text-[11px] text-muted-foreground">{env.pagespeedKey ? "API key configured (PAGESPEED_API_KEY)." : "No API key — works at low volume; set PAGESPEED_API_KEY for regular use."}</p>
          </div>
        </div>
      </Section>

      <div className="sticky bottom-0 flex justify-end rounded-2xl border border-border/40 bg-background/90 p-3 backdrop-blur-md">
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Save settings"}</Button>
      </div>
    </form>
  );
}
