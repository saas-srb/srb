"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles, Copy, FilePlus2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { Field, PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import { SectionCard } from "@/components/products/viralpulse-ai/SmmsUi";
import SopMarkdown from "@/components/products/playbook-ai/SopMarkdown";
import { runGeneratorAction, postFromGeneratorAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import { GENERATOR_TYPES, LANGUAGES, PLATFORMS, PLATFORM_META, TONES, isPostPlatform, type GeneratorType } from "@/lib/products/viralpulse-ai/constants";
import { hashtagText, type WorkspaceOutput } from "@/lib/products/viralpulse-ai/content";
import { cn, formatDateTime } from "@/lib/utils";

export interface WorkspaceRun {
  id: string;
  kind: string;
  label: string;
  platform: string | null;
  createdAt: string;
  output: WorkspaceOutput;
}

type Item = WorkspaceOutput["items"][number];

function itemText(i: Item): string {
  return [i.heading, i.body, i.cta && `CTA: ${i.cta}`, i.hashtags.length ? hashtagText(i.hashtags) : ""].filter(Boolean).join("\n\n");
}

export default function AiWorkspace({ history, offers, clients, canCreatePost }: { history: WorkspaceRun[]; offers: { _id: string; title: string; badge: string }[]; clients: { _id: string; name: string }[]; canCreatePost: boolean }) {
  const router = useRouter();
  const [type, setType] = useState<GeneratorType>("social_post");
  const [platform, setPlatform] = useState("instagram");
  const [brief, setBrief] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [language, setLanguage] = useState("English");
  const [count, setCount] = useState(3);
  const [offerId, setOfferId] = useState("");
  const [clientId, setClientId] = useState("");
  const [result, setResult] = useState<{ platform: string; output: WorkspaceOutput } | null>(null);
  const [runs, setRuns] = useState(history);
  const [pending, start] = useTransition();
  const [creating, startCreate] = useTransition();

  function generate() {
    start(async () => {
      const res = await runGeneratorAction({ type, platform, brief, audience, tone, language, count, offerId, clientId });
      if (!res.ok) return void toast.error(res.error);
      setResult({ platform, output: res.output });
      setRuns((r) => [{ id: res.id, kind: type, label: brief.slice(0, 120), platform: platform || null, createdAt: new Date().toISOString(), output: res.output }, ...r].slice(0, 20));
      toast.success("Generated — saved to your history.");
    });
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied."), () => toast.error("Couldn't copy."));
  }

  function toPost(item: Item, plat: string) {
    startCreate(async () => {
      const res = await postFromGeneratorAction({ heading: item.heading, body: item.body, cta: item.cta, hashtags: item.hashtags }, isPostPlatform(plat) ? plat : "linkedin");
      if (!res.ok) return void toast.error(res.error);
      toast.success("Post draft created.");
      router.push(`/viralpulse-ai/posts/${res.id}`);
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4 self-start">
        <SectionCard title="What do you need?">
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            {GENERATOR_TYPES.map((g) => (
              <button key={g.value} type="button" aria-pressed={type === g.value} onClick={() => setType(g.value)} className={cn("rounded-xl border p-2.5 text-left transition", type === g.value ? "border-primary bg-primary/8" : "border-border/50 hover:border-primary/40")}>
                <p className="text-sm font-semibold">{g.label}</p>
                <p className="text-[11px] text-muted-foreground">{g.description}</p>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Platform"><OptionSelect value={platform} onChange={setPlatform} options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_META[p].label }))} noneLabel="Any / multi-platform" aria-label="Platform" /></Field>
            <Field label="How many" htmlFor="ws-n"><Input id="ws-n" type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} className="w-24" /></Field>
            <Field label="Brief *" htmlFor="ws-brief" className="sm:col-span-2"><Textarea id="ws-brief" rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Launch of our Agentic AI training batch starting 15 Oct — weekend classes, live projects, placement support" /></Field>
            <Field label="Audience" htmlFor="ws-aud"><Input id="ws-aud" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Brand default" /></Field>
            <Field label="Tone" htmlFor="ws-tone"><Input id="ws-tone" list="ws-tones" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Brand default" /><datalist id="ws-tones">{TONES.map((t) => <option key={t} value={t} />)}</datalist></Field>
            <Field label="Language" htmlFor="ws-lang"><Input id="ws-lang" list="ws-langs" value={language} onChange={(e) => setLanguage(e.target.value)} /><datalist id="ws-langs">{LANGUAGES.map((t) => <option key={t} value={t} />)}</datalist></Field>
            <Field label="Live offer"><OptionSelect value={offerId} onChange={setOfferId} options={offers.map((o) => ({ value: o._id, label: `${o.title} · ${o.badge}` }))} noneLabel="None" aria-label="Offer" /></Field>
            {clients.length > 0 && <Field label="For client"><OptionSelect value={clientId} onChange={setClientId} options={clients.map((c) => ({ value: c._id, label: c.name }))} noneLabel="Our own brand" aria-label="Client" /></Field>}
          </div>
          <Button type="button" className="mt-4" onClick={generate} disabled={pending || !brief.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {pending ? "Generating…" : "Generate"}
          </Button>
        </SectionCard>

        {result && (
          <SectionCard title="Results" description={result.output.summary}>
            <div className="space-y-3">
              {result.output.items.map((it, i) => (
                <div key={i} className="rounded-xl border border-border/50 bg-background/60 p-3">
                  <div className="mb-1 flex items-start gap-2">
                    <p className="flex-1 font-semibold">{it.heading}</p>
                    {result.platform && <PlatformChip platform={result.platform} />}
                  </div>
                  <SopMarkdown className="[&_table]:text-xs">{it.body}</SopMarkdown>
                  {it.cta && <p className="mt-1 text-xs"><span className="font-semibold">CTA:</span> {it.cta}</p>}
                  {it.hashtags.length > 0 && <p className="mt-1 text-xs text-primary">{hashtagText(it.hashtags)}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" size="xs" variant="outline" onClick={() => copy(itemText(it))}><Copy className="size-3" /> Copy</Button>
                    {canCreatePost && (
                      <Button type="button" size="xs" variant="outline" disabled={creating} onClick={() => toPost(it, result.platform)}>
                        <FilePlus2 className="size-3" /> {`Create ${isPostPlatform(result.platform) ? PLATFORM_META[result.platform].label : "LinkedIn"} post`}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>

      <SectionCard title="Your recent generations" description="Saved automatically.">
        {runs.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {runs.map((r) => (
              <li key={r.id}>
                <button type="button" className="w-full py-2 text-left hover:text-primary" onClick={() => setResult({ platform: r.platform ?? "", output: r.output })}>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><History className="size-3" />{`${GENERATOR_TYPES.find((g) => g.value === r.kind)?.label ?? r.kind} · ${formatDateTime(r.createdAt)}`}</p>
                  <p className="line-clamp-2 text-xs font-medium">{r.label}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
