"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, LoaderCircle, Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { SectionCard } from "@/components/products/agentos/AibotsUi";
import CallPurposesField from "@/components/products/agentos/voice/CallPurposesField";
import DataFieldsEditor from "@/components/products/agentos/voice/DataFieldsEditor";
import PublicAccessField from "@/components/products/agentos/voice/PublicAccessField";
import { withSuggestions } from "@/lib/products/agentos/calls/data-field-editor";
import { cn } from "@/lib/utils";
import type { VoiceSlotProps } from "@/components/products/agentos/agent-kind-slots";
import { PERSONA_LIMITS } from "@/lib/products/agentos/voice/prompt";
import { emptyVoiceConfig, VOICE_LIMITS } from "@/lib/products/agentos/voice/config";
import { loadVoiceOptionsAction, retryVoiceSyncAction, type VoiceOptions } from "@/app/(products)/agentos/(protected)/voice-actions";

function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const ago = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** The voice-agent part of the agent form: voice + preview, language, greeting, call length, and the ElevenLabs sync status. */
export default function VoiceSection({ botId, value, onChange, disabled }: VoiceSlotProps) {
  const router = useRouter();
  const v = value ?? emptyVoiceConfig();
  const [opts, setOpts] = useState<VoiceOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [retrying, startRetry] = useTransition();
  const [sync, setSync] = useState<{ syncedAt: string | null; syncError: string | null } | null>(null);

  const fetchOptions = () =>
    loadVoiceOptionsAction()
      .then((r) => (r.ok ? setOpts(r) : setLoadError(r.error)))
      .catch(() => setLoadError("Couldn't load voices. Please try again."))
      .finally(() => setLoading(false));
  const reload = () => {
    setLoading(true);
    setLoadError(null);
    void fetchOptions();
  };
  useEffect(() => {
    void fetchOptions();
  }, []);
  useEffect(() => () => audioRef.current?.pause(), []);

  const set = (patch: Partial<typeof v>) => onChange({ ...v, ...patch });

  const voice = opts?.voices.find((x) => x.voiceId === v.voiceId) ?? null;
  const voiceOptions = (opts?.voices ?? []).map((x) => ({ value: x.voiceId, label: x.category ? `${x.name} · ${x.category}` : x.name }));
  // A saved voice/language that is no longer on the account must stay visible instead of silently changing.
  if (v.voiceId && !voice && opts) voiceOptions.unshift({ value: v.voiceId, label: `${v.voiceName || v.voiceId} (not on this account)` });
  const langOptions = (opts?.languages ?? []).map((x) => ({ value: x.id, label: x.name }));
  if (v.language && opts && !langOptions.some((l) => l.value === v.language)) langOptions.unshift({ value: v.language, label: v.language });

  const togglePreview = () => {
    if (!voice?.previewUrl) return;
    if (playing === voice.voiceId) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(voice.previewUrl);
    a.onended = () => setPlaying(null);
    a.onerror = () => {
      setPlaying(null);
      toast.error("Couldn't play that preview.");
    };
    audioRef.current = a;
    setPlaying(voice.voiceId);
    a.play().catch(() => setPlaying(null));
  };

  const retry = () =>
    startRetry(async () => {
      if (!botId) return;
      const r = await retryVoiceSyncAction(botId);
      if (!r.ok) return void toast.error(r.error);
      setSync({ syncedAt: r.syncedAt, syncError: r.syncError });
      if (r.synced) toast.success("Voice agent synced with ElevenLabs.");
      else toast.error(r.syncError ?? "Sync failed.");
      router.refresh();
    });

  const syncedAt = sync ? sync.syncedAt : v.syncedAt ? new Date(v.syncedAt).toISOString() : null;
  const syncError = sync ? sync.syncError : v.syncError;

  return (
    <>
    <SectionCard
      title="Voice"
      description="How this agent sounds and starts a call. It is created on your ElevenLabs account when you save."
      action={
        botId ? (
          <div className="flex items-center gap-2">
            {syncError ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300"><AlertTriangle className="size-3" /> Sync issue</span>
            ) : syncedAt ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-3" /> Synced {ago(syncedAt)}</span>
            ) : (
              <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Not synced yet</span>
            )}
            <Button type="button" size="sm" variant="outline" onClick={retry} disabled={retrying || disabled}>
              {retrying ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} {syncError ? "Retry sync" : "Sync now"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {syncError && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-900 dark:text-rose-200">
          {syncError} <span className="text-muted-foreground">Your settings are saved; fix the problem and retry.</span>
        </div>
      )}

      {opts && !opts.configured ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
          ElevenLabs isn&apos;t connected for this workspace, so voices can&apos;t be loaded. <Link href="/commandos/settings/integrations" className="font-semibold underline">Add your ElevenLabs API key in Settings → Integrations</Link>, then reload this page.
        </div>
      ) : loadError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-900 dark:text-rose-200">
          {loadError}
          <Button type="button" size="sm" variant="outline" onClick={reload}><RefreshCw className="size-3.5" /> Try again</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Voice" htmlFor="v-voice" hint={loading ? "Loading your ElevenLabs voices…" : `${voiceOptions.length} voices on your ElevenLabs account.`}>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <OptionSelect
                  id="v-voice"
                  value={v.voiceId}
                  options={voiceOptions}
                  placeholder={loading ? "Loading…" : "Pick a voice"}
                  disabled={disabled || loading}
                  onChange={(id) => set({ voiceId: id, voiceName: opts?.voices.find((x) => x.voiceId === id)?.name ?? id })}
                />
              </div>
              <Button type="button" variant="outline" size="icon" onClick={togglePreview} disabled={!voice?.previewUrl} aria-label={playing ? "Stop preview" : "Play voice preview"} title={voice?.previewUrl ? "Preview this voice" : "No preview available"}>
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
            </div>
          </Field>
          <Field label="Language" htmlFor="v-lang" hint="The language the agent listens for and speaks.">
            <OptionSelect id="v-lang" value={v.language} options={langOptions} placeholder={loading ? "Loading…" : "Pick a language"} disabled={disabled || loading} onChange={(l) => set({ language: l })} />
          </Field>
          <Field label="First message" htmlFor="v-first" className="sm:col-span-2" hint={`What the agent says when the call connects. Leave empty to let the caller speak first. ${v.firstMessage.length} / ${VOICE_LIMITS.firstMessageMax}`}>
            <Textarea id="v-first" rows={2} maxLength={VOICE_LIMITS.firstMessageMax} value={v.firstMessage} disabled={disabled} onChange={(e) => set({ firstMessage: e.target.value })} />
          </Field>
          <Field label="Maximum call length (seconds)" htmlFor="v-max" hint={`${VOICE_LIMITS.maxDurationMin}–${VOICE_LIMITS.maxDurationMax}. Leave blank for the ElevenLabs default.`}>
            <Input id="v-max" type="number" inputMode="numeric" min={VOICE_LIMITS.maxDurationMin} max={VOICE_LIMITS.maxDurationMax} step={1} value={v.maxDurationSecs ?? ""} disabled={disabled} placeholder="ElevenLabs default" onChange={(e) => set({ maxDurationSecs: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>
        </div>
      )}
    </SectionCard>

    <SectionCard title="Persona" description="Who this agent is when it joins a call or a meeting as a team member. All optional; they become part of its instructions.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" htmlFor="v-pname" hint="What people call the agent.">
          <Input id="v-pname" maxLength={PERSONA_LIMITS.displayNameMax} value={v.displayName ?? ""} disabled={disabled} onChange={(e) => set({ displayName: e.target.value })} />
        </Field>
        <Field label="Job title / role" htmlFor="v-prole" hint="e.g. the role it plays on the team.">
          <Input id="v-prole" maxLength={PERSONA_LIMITS.jobTitleMax} value={v.jobTitle ?? ""} disabled={disabled} onChange={(e) => set({ jobTitle: e.target.value })} />
        </Field>
        <Field label="How they talk" htmlFor="v-ptone" className="sm:col-span-2" hint={`Tone and manner, in your own words. ${(v.toneNote ?? "").length} / ${PERSONA_LIMITS.toneMax}`}>
          <Textarea id="v-ptone" rows={2} maxLength={PERSONA_LIMITS.toneMax} value={v.toneNote ?? ""} disabled={disabled} onChange={(e) => set({ toneNote: e.target.value })} />
        </Field>
        <Field label="Disclosure line (optional)" htmlFor="v-pdisc" className="sm:col-span-2" hint={`A line you want the agent to say early on, in your wording. ${(v.disclosureLine ?? "").length} / ${PERSONA_LIMITS.disclosureMax}`}>
          <Input id="v-pdisc" maxLength={PERSONA_LIMITS.disclosureMax} value={v.disclosureLine ?? ""} disabled={disabled} onChange={(e) => set({ disclosureLine: e.target.value })} />
        </Field>
      </div>
      <p className="mt-3 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Always on: the agent is an AI and says so truthfully whenever anyone sincerely asks. A persona never overrides this, and it can&apos;t be switched off.
      </p>
    </SectionCard>

    <SectionCard title="Call purposes" description="The kinds of call this agent can be used for. Other products only offer this agent for the purposes you tick here.">
      <CallPurposesField
        value={v.purposes ?? []}
        disabled={disabled}
        onChange={(purposes) => {
          // Ticking the first purpose on an empty list fills in its suggested questions, which you can edit below.
          const fields = v.dataFields ?? [];
          const added = purposes.some((p) => !(v.purposes ?? []).includes(p));
          set({ purposes, dataFields: added && fields.length === 0 ? withSuggestions(fields, purposes) : fields });
        }}
      />
    </SectionCard>

    <SectionCard title="Data to collect" description="What the agent should find out during a call. The answers are saved on the call and written back to the lead, applicant or client.">
      <DataFieldsEditor fields={v.dataFields ?? []} purposes={v.purposes ?? []} disabled={disabled} onChange={(dataFields) => set({ dataFields })} />
    </SectionCard>

    <SectionCard title="Website access" description="Let visitors on your own website talk to this agent.">
      <PublicAccessField isPublic={v.isPublic ?? false} origins={v.allowedOrigins ?? []} disabled={disabled} onChange={(p) => set({ isPublic: p.isPublic, allowedOrigins: p.allowedOrigins })} />
    </SectionCard>
    </>
  );
}
