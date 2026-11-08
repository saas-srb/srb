"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import { Field, PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import { YOUTUBE_CATEGORIES } from "@/lib/products/viralpulse-ai/post-wizard/helpers";
import { Callout, FieldError, Switch, sectionTitle, type StepProps } from "./shared";
import { cn } from "@/lib/utils";

const PRIVACY = [
  { key: "private", label: "Private", hint: "Only you can see it. Safe default: change it in YouTube Studio when ready." },
  { key: "unlisted", label: "Unlisted", hint: "Anyone with the link can watch." },
  { key: "public", label: "Public", hint: "Everyone can find it as soon as it is processed." },
] as const;

function Radio<T extends string>({ label, value, onChange, options, disabled }: { label: string; value: T | null; onChange: (v: T) => void; options: readonly { key: T; label: string; hint: string }[]; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} disabled={disabled} onClick={() => onChange(o.key)}
          className={cn("rounded-xl border p-2.5 text-left transition focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none disabled:opacity-60", value === o.key ? "border-primary bg-primary/8" : "border-border/60 hover:border-primary/40")}>
          <span className="block text-sm font-semibold">{o.label}</span>
          <span className="block text-[11px] text-muted-foreground">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

export default function StepOptions({ init, s, dispatch, errors, showErrors, locked, ai }: StepProps) {
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const o = s.options;
  const has = (p: string) => s.platforms.some((x) => x === p);
  const none = !has("youtube") && !has("instagram") && !has("facebook") && !has("linkedin");
  const setType = (p: "youtube" | "facebook", key: string) => dispatch({ type: "set", patch: { contentTypes: { ...s.contentTypes, [p]: key as never } } });

  return (
    <div className="space-y-6">
      {none && <Callout tone="info">The platforms you chose have no extra options. Go on to scheduling.</Callout>}

      {has("youtube") && (
        <section className="space-y-4 rounded-2xl border border-border/50 p-4" aria-labelledby="opt-yt">
          <h3 id="opt-yt" className={`${sectionTitle} flex items-center gap-2`}><PlatformChip platform="youtube" full /> options</h3>
          <div className="space-y-2">
            <p className="text-xs font-medium">Who can watch</p>
            <Radio label="YouTube privacy" value={o.youtubePrivacy} disabled={locked} options={PRIVACY} onChange={(v) => dispatch({ type: "option", patch: { youtubePrivacy: v } })} />
            <p className="text-[11px] text-muted-foreground">We choose private unless you say otherwise. Google may also keep videos from apps that have not passed its API compliance review private, whatever is chosen here: check in YouTube Studio after the first upload.</p>
          </div>
          <AiField {...ai("post.youtube.category")} label="Category" as="custom" value={YOUTUBE_CATEGORIES.find((c) => c.id === o.youtubeCategoryId)?.label ?? ""} disabled={locked} enumOptions={YOUTUBE_CATEGORIES.map((c) => c.label)}
            onChange={(x) => { const c = YOUTUBE_CATEGORIES.find((y) => y.label === String(x)); if (c) dispatch({ type: "option", patch: { youtubeCategoryId: c.id } }); }}>
            <select aria-label="YouTube category" disabled={locked} value={o.youtubeCategoryId} onChange={(e) => dispatch({ type: "option", patch: { youtubeCategoryId: e.target.value } })} className="h-9 w-full rounded-xl border border-border/50 bg-background px-3 text-sm">
              <option value="">Let YouTube use its default</option>
              {YOUTUBE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </AiField>
          <div className="space-y-2">
            <p className="text-xs font-medium">Is this video made for kids? *</p>
            <div role="radiogroup" aria-label="Made for kids" aria-describedby="kids-note" className="grid gap-2 sm:grid-cols-2">
              {[{ v: true, l: "Yes, it is made for kids" }, { v: false, l: "No, it is not made for kids" }].map((x) => (
                <button key={String(x.v)} type="button" role="radio" aria-checked={o.youtubeMadeForKids === x.v} disabled={locked} onClick={() => dispatch({ type: "option", patch: { youtubeMadeForKids: x.v } })}
                  className={cn("rounded-xl border p-2.5 text-left text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none", o.youtubeMadeForKids === x.v ? "border-primary bg-primary/8" : "border-border/60 hover:border-primary/40")}>{x.l}</button>
              ))}
            </div>
            <p id="kids-note" className="text-[11px] text-muted-foreground">YouTube requires this legal declaration for every upload. It is never filled in by AI or by default: answer it yourself.</p>
            <FieldError>{err("madeForKids")}</FieldError>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium">
            <Switch checked={s.contentTypes.youtube === "short"} disabled={locked} aria-label="Publish as a YouTube Short" onCheckedChange={(on) => setType("youtube", on ? "short" : "video")} />
            Publish as a Short (vertical or square, up to 3 minutes; #Shorts is added to the description)
          </label>
        </section>
      )}

      {has("instagram") && (
        <section className="space-y-3 rounded-2xl border border-border/50 p-4" aria-labelledby="opt-ig">
          <h3 id="opt-ig" className={`${sectionTitle} flex items-center gap-2`}><PlatformChip platform="instagram" full /> options</h3>
          <p className="text-xs text-muted-foreground">{`Format: ${({ image: "Photo post", carousel: "Carousel", reel: "Reel", story: "Story" } as Record<string, string>)[s.contentTypes.instagram ?? "image"]} (chosen in step 1).`}</p>
          {s.contentTypes.instagram === "reel" && (
            <label className="flex items-center gap-2 text-xs font-medium">
              <Switch checked={o.instagramShareToFeed} disabled={locked} aria-label="Also show the Reel in the feed" onCheckedChange={(v) => dispatch({ type: "option", patch: { instagramShareToFeed: v } })} />
              Also show the Reel in the profile feed
            </label>
          )}
          {s.contentTypes.instagram !== "story" && (
            <Field label="Location (optional)" hint="A Facebook Place id for the location. Leave empty for none. We can't look places up, so paste the id from the place's Facebook page.">
              <Input value={o.instagramLocationId} disabled={locked} inputMode="numeric" placeholder="e.g. 123456789012345" onChange={(e) => dispatch({ type: "option", patch: { instagramLocationId: e.target.value.replace(/[^0-9]/g, "").slice(0, 32) } })} />
            </Field>
          )}
          <p className="text-[11px] text-muted-foreground">Collaborator invites are not supported by the connection yet, so they are not offered.</p>
        </section>
      )}

      {has("facebook") && (s.contentTypes.facebook === "video" || s.contentTypes.facebook === "reel") && (
        <section className="space-y-2 rounded-2xl border border-border/50 p-4" aria-labelledby="opt-fb">
          <h3 id="opt-fb" className={`${sectionTitle} flex items-center gap-2`}><PlatformChip platform="facebook" full /> options</h3>
          <label className="flex items-center gap-2 text-xs font-medium">
            <Switch checked={s.contentTypes.facebook === "reel"} disabled={locked} aria-label="Publish as a Facebook Reel" onCheckedChange={(on) => setType("facebook", on ? "reel" : "video")} />
            Publish as a Reel (vertical, 3 to 90 seconds)
          </label>
        </section>
      )}

      {has("linkedin") && (
        <section className="space-y-3 rounded-2xl border border-border/50 p-4" aria-labelledby="opt-li">
          <h3 id="opt-li" className={`${sectionTitle} flex items-center gap-2`}><PlatformChip platform="linkedin" full /> options</h3>
          <Radio label="LinkedIn visibility" value={o.linkedinVisibility} disabled={locked} options={[{ key: "PUBLIC", label: "Anyone", hint: "Visible to everyone on and off LinkedIn." }, { key: "CONNECTIONS", label: "Connections only", hint: "Only the account's connections." }] as const} onChange={(v) => dispatch({ type: "option", patch: { linkedinVisibility: v } })} />
        </section>
      )}

      <section className="space-y-1 rounded-2xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground" aria-label="Company-wide publishing settings">
        <p className="font-semibold text-foreground">Set for the whole company</p>
        <p>{`Time zone: ${init.settings.timezone}. AI caption note ${init.settings.aiDisclosureOff ? "is switched off for AI pictures where the platform has no AI label" : "is added to posts with AI-generated media"}.`}</p>
        {init.can.settings ? <p><Link href="/viralpulse-ai/settings/publishing" className="font-semibold text-primary underline">Change these in Settings &gt; Publishing</Link></p> : <p>Ask someone who manages Settings to change these.</p>}
      </section>
    </div>
  );
}
