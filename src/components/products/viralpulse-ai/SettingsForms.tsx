"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Plug, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import { Field, PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import type { FieldKey } from "@/lib/products/viralpulse-ai/ai-field/registry";
import { saveBrandAction, saveAiSettingsAction, disconnectIntegrationAction, selectIntegrationTargetAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import type { BrandContext, AiSettings } from "@/lib/products/viralpulse-ai/settings";
import type { IntegrationView } from "@/lib/products/viralpulse-ai/integrations";
import { PLATFORM_META, type Platform } from "@/lib/products/viralpulse-ai/constants";
import { formatDateTime } from "@/lib/utils";

const lines = (xs: string[]) => xs.join("\n");

export function BrandForm({ brand, services, canGenerate = false }: { brand: BrandContext; services: string[]; canGenerate?: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ ...brand, services: lines(brand.services), products: lines(brand.products), sellingPoints: lines(brand.sellingPoints), avoid: lines(brand.avoid), brandHashtags: brand.brandHashtags.join(" ") });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const lineList = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);
  // What the other brand fields currently say (the server also reads the saved brand and the company's own data).
  const ai = (fieldKey: FieldKey) => ({ fieldKey, getContext: () => ({ about: f.about, services: lineList(f.services), products: lineList(f.products), tone: f.tone, targetAudience: f.targetAudience, messaging: f.messaging, websiteInfo: f.websiteInfo, sellingPoints: lineList(f.sellingPoints), avoid: lineList(f.avoid), brandHashtags: f.brandHashtags }) as Record<string, unknown>, aiDisabled: !canGenerate, aiDisabledReason: "AI generation isn't available to you here." });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveBrandAction({ ...f, brandHashtags: f.brandHashtags.split(/[\s,]+/) }); if (!r.ok) toast.error(r.error); else { toast.success("Brand context saved."); router.refresh(); } }); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <AiField {...ai("brand.about")} label="About the company" id="b-about" as="textarea" rows={3} className="sm:col-span-2" value={f.about} onChange={(v) => set("about", String(v))} placeholder="What the company does, for whom, and why it's different" />
        <AiField {...ai("brand.services")} label="Services (one per line)" id="b-svc" as="list" rows={5} hint={`Suggestions from the site catalogue: ${services.slice(0, 6).join(", ")}…`} value={f.services.split("\n")} onChange={(v) => set("services", Array.isArray(v) ? v.join("\n") : String(v))} />
        <AiField {...ai("brand.products")} label="Products (one per line)" id="b-prod" as="list" rows={5} value={f.products.split("\n")} onChange={(v) => set("products", Array.isArray(v) ? v.join("\n") : String(v))} />
        <AiField {...ai("brand.tone")} label="Brand tone" id="b-tone" value={f.tone} onChange={(v) => set("tone", String(v))} />
        <AiField {...ai("brand.brandHashtags")} label="Branded hashtags" id="b-tags" as="custom" value={f.brandHashtags.split(/[\s,]+/).filter(Boolean)} onChange={(v) => set("brandHashtags", Array.isArray(v) ? v.join(" ") : String(v))}><Input id="b-tags" value={f.brandHashtags} onChange={(e) => set("brandHashtags", e.target.value)} placeholder="One word each, starting with #" /></AiField>
        <AiField {...ai("brand.targetAudience")} label="Target audience" id="b-aud" as="textarea" rows={2} className="sm:col-span-2" value={f.targetAudience} onChange={(v) => set("targetAudience", String(v))} />
        <AiField {...ai("brand.messaging")} label="Brand messaging" id="b-msg" as="textarea" rows={3} className="sm:col-span-2" value={f.messaging} onChange={(v) => set("messaging", String(v))} placeholder="Core message, tagline, proof points" />
        <AiField {...ai("brand.websiteInfo")} label="Website information" id="b-web" as="textarea" rows={2} className="sm:col-span-2" value={f.websiteInfo} onChange={(v) => set("websiteInfo", String(v))} placeholder="Key pages and what visitors should do there" />
        <AiField {...ai("brand.sellingPoints")} label="Key selling points (one per line)" id="b-usp" as="list" rows={4} value={f.sellingPoints.split("\n")} onChange={(v) => set("sellingPoints", Array.isArray(v) ? v.join("\n") : String(v))} />
        <AiField {...ai("brand.avoid")} label="Never say / claim (one per line)" id="b-avoid" as="list" rows={4} value={f.avoid.split("\n")} onChange={(v) => set("avoid", Array.isArray(v) ? v.join("\n") : String(v))} placeholder={"One phrase per line"} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={f.includeOffers} onChange={(e) => set("includeOffers", e.target.checked)} /> Let the AI mention currently active Festival Offers when relevant</label>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save brand context</Button>
    </form>
  );
}

export function AiSettingsForm({ ai }: { ai: AiSettings }) {
  const router = useRouter();
  const [f, setF] = useState({ textModel: ai.textModel, imageModel: ai.imageModel, imageQuality: ai.imageQuality, temperature: ai.temperature === null ? "" : String(ai.temperature), maxOutputTokens: String(ai.maxOutputTokens), dailyGenerationLimit: String(ai.dailyGenerationLimit), imageCostUsd: String(ai.imageCostUsd) });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveAiSettingsAction({ ...f, temperature: f.temperature === "" ? null : f.temperature }); if (!r.ok) toast.error(r.error); else { toast.success("AI settings saved."); router.refresh(); } }); }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Text model (OpenAI)" htmlFor="ai-tm"><Input id="ai-tm" list="ai-models" value={f.textModel} onChange={(e) => set("textModel", e.target.value)} /><datalist id="ai-models">{ai.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</datalist></Field>
        <Field label="Image model (OpenAI)" htmlFor="ai-im"><Input id="ai-im" value={f.imageModel} onChange={(e) => set("imageModel", e.target.value)} /></Field>
        <Field label="Image quality"><OptionSelect value={f.imageQuality} onChange={(v) => set("imageQuality", v)} options={[{ value: "low", label: "Low (cheapest)" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "xhigh", label: "Extra high (GPT-Image-2.5 only)" }, { value: "max", label: "Max (GPT-Image-2.5 only)" }]} aria-label="Image quality" /></Field>
        <Field label="Temperature" htmlFor="ai-t" hint="Blank = model default (needed for reasoning models)."><Input id="ai-t" type="number" step="0.1" min={0} max={2} value={f.temperature} onChange={(e) => set("temperature", e.target.value)} /></Field>
        <Field label="Max output tokens" htmlFor="ai-mo"><Input id="ai-mo" type="number" min={1000} max={32000} value={f.maxOutputTokens} onChange={(e) => set("maxOutputTokens", e.target.value)} /></Field>
        <Field label="Daily AI generations per user" htmlFor="ai-dl" hint="0 = unlimited"><Input id="ai-dl" type="number" min={0} value={f.dailyGenerationLimit} onChange={(e) => set("dailyGenerationLimit", e.target.value)} /></Field>
        <Field label="Fallback cost per image (USD)" htmlFor="ai-ic"><Input id="ai-ic" type="number" step="0.01" min={0} value={f.imageCostUsd} onChange={(e) => set("imageCostUsd", e.target.value)} /></Field>
      </div>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save AI settings</Button>
    </form>
  );
}

function TargetSelect({ provider, platform, options, value }: { provider: string; platform: Platform; options: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <PlatformChip platform={platform} full />
      <div className="min-w-0 flex-1">
        {options.length === 0 ? <span className="text-xs text-muted-foreground">No accounts found for this platform on the connected login.</span> : (
          <OptionSelect value={value} disabled={pending} onChange={(v) => start(async () => { const r = await selectIntegrationTargetAction(provider, platform, v); if (!r.ok) toast.error(r.error); else { toast.success(`${PLATFORM_META[platform].label} target saved.`); router.refresh(); } })} options={options.map((o) => ({ value: o.id, label: o.name }))} aria-label={`${PLATFORM_META[platform].label} account`} />
        )}
      </div>
    </div>
  );
}

export function IntegrationsPanel({ items, encryptionReady }: { items: IntegrationView[]; encryptionReady: boolean }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {items.map((it) => (
        <div key={it.provider} className="space-y-3 rounded-2xl border border-border/50 bg-background/60 p-4">
          <div>
            <p className="font-semibold">{it.label}</p>
            <div className="mt-1 flex flex-wrap gap-1">{it.platforms.map((p) => <PlatformChip key={p} platform={p} />)}</div>
          </div>
          {it.redirectUrl && (
            <div className="text-[11px] text-muted-foreground">
              <p>{`Register this exact redirect URL in your ${it.provider === "meta" ? "Meta app (Valid OAuth Redirect URIs)" : it.provider === "google" ? "Google OAuth client (Authorised redirect URIs)" : "LinkedIn app (Authorized redirect URLs)"}:`}</p>
              <code className="mt-0.5 block break-all rounded bg-muted px-1.5 py-1 text-[11px] text-foreground">{it.redirectUrl}</code>
            </div>
          )}
          {it.connected ? (
            <>
              <p className="text-xs">{`Connected as ${it.accountName ?? "—"}${it.connectedAt ? ` · ${formatDateTime(it.connectedAt)}` : ""}`}</p>
              {it.expiresAt && <p className="text-[11px] text-muted-foreground">{`Token expires ${formatDateTime(it.expiresAt)}`}</p>}
              {it.lastError && <p className="text-[11px] text-rose-600 dark:text-rose-400">{`Last error: ${it.lastError}`}</p>}
              <div className="space-y-2">{it.platforms.map((p) => <TargetSelect key={p} provider={it.provider} platform={p} options={it.targets[p] ?? []} value={it.selected[p] ?? ""} />)}</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/viralpulse-ai/oauth/${it.provider}`} />}><Plug className="size-3.5" /> Reconnect</Button>
                <ActionButton size="sm" variant="ghost" action={disconnectIntegrationAction.bind(null, it.provider)} success="Disconnected" confirm={{ title: `Disconnect ${it.label}?`, description: "Stored tokens are deleted. Scheduled posts for these platforms will fail until it's reconnected.", confirmLabel: "Disconnect" }}><Unplug className="size-3.5" /> Disconnect</ActionButton>
              </div>
            </>
          ) : it.configured && encryptionReady ? (
            <Button size="sm" nativeButton={false} render={<a href={`/api/viralpulse-ai/oauth/${it.provider}`} />}><Plug className="size-3.5" /> Connect</Button>
          ) : (
            <p className="text-xs text-muted-foreground">{!encryptionReady ? "Secure storage isn't available right now. Please try again in a few minutes, or contact support." : `App credentials aren't configured on the server (${it.provider === "meta" ? "META_APP_ID / META_APP_SECRET" : it.provider === "google" ? "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET" : "LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET"}).`}</p>
          )}
        </div>
      ))}
    </div>
  );
}
