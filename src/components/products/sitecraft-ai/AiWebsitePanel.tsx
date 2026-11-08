"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, History, Loader2, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { generateWebsiteAction, restoreWebsiteVersionAction } from "@/app/(products)/sitecraft-ai/(protected)/ai-website/actions";

interface State {
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt?: string;
  model?: string;
  error?: string;
  plan?: { sitePrompt: string; language: string; audience: string; lookAndFeel: string; pages: string[]; assumptions?: string[] };
  summary?: { checks?: { issuesFound: number; repaired: boolean; scrubbed: number }; mood: string; services: string[]; pages: number; images: number; theme: { primary: string; headingFont: string; bodyFont: string; header: string; footer: string } };
}

export interface VersionInfo { id: string; number: number; createdAt: string; source: "generated" | "restored"; restoredFrom?: number; model?: string; prompt?: string; mood?: string; pages: number; services: string[]; current: boolean }

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

export default function AiWebsitePanel({ state, canGenerate, versions = [] }: { state: State | null; canGenerate: boolean; versions?: VersionInfo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [local, setLocal] = useState<{ ok: boolean; text: string } | null>(null);
  const [prompt, setPrompt] = useState(state?.plan?.sitePrompt ?? "");
  const [mountedAt] = useState(() => Date.now());
  const running = pending || (state?.status === "running" && mountedAt - new Date(state.startedAt).getTime() < 20 * 60_000);
  const changed = !!state?.plan && prompt.trim() !== state.plan.sitePrompt.trim();
  const hasPrompt = prompt.trim().length > 0;

  const restore = (v: VersionInfo) => {
    if (!window.confirm(`Switch your website to version ${v.number}? Your current content is kept as a version, so you can switch back any time.`)) return;
    start(async () => {
      setLocal(null);
      const res = await restoreWebsiteVersionAction(v.id);
      if (res.ok) {
        toast.success(`Switched to version ${res.number}`);
        setLocal({ ok: true, text: `Your website now shows version ${res.number}.` });
        router.refresh();
      } else {
        toast.error(res.error);
        setLocal({ ok: false, text: res.error });
      }
    });
  };

  const build = () =>
    start(async () => {
      setLocal(null);
      const res = await generateWebsiteAction(prompt);
      if (res.ok) {
        toast.success("Your website is ready");
        setLocal({ ok: true, text: `Published ${res.pages} pages. Open your site to see it.` });
        router.refresh();
      } else {
        toast.error(res.error);
        setLocal({ ok: false, text: res.error });
      }
    });

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-2 p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          {running ? <Loader2 className="size-4 animate-spin text-primary" /> : state?.status === "done" ? <CheckCircle2 className="size-4 text-emerald-600" /> : state?.status === "failed" ? <TriangleAlert className="size-4 text-amber-600" /> : <Sparkles className="size-4 text-primary" />}
          {running ? "Writing your website…" : state?.status === "done" ? "Your website was written for your business" : state?.status === "failed" ? "The last attempt didn't finish" : "Not written yet"}
        </p>
        <p className="text-sm text-muted-foreground">
          {running
            ? "This takes a minute or two. You can leave this page; your current site stays live until the new one is ready."
            : state?.status === "done"
              ? `Finished ${when(state.finishedAt)}${state.model ? ` · ${state.model}` : ""}.`
              : state?.status === "failed"
                ? state.error
                : "Write what you want your website to be, or leave the box empty and we'll write it from your business categories."}
        </p>
      </GlassCard>

      <GlassCard className="space-y-4 p-5">
        <div>
          <p className="text-sm font-bold text-foreground">Your website brief</p>
          <p className="text-xs text-muted-foreground">
            This is the brief your website is built from. You are free to change anything: the language, the pages and what they are called, the look, the tone, who it is for. Building again keeps your theme and writes the content new. Pages you wrote or edited yourself are never touched, and nothing is invented: no fake numbers, clients, reviews or contact details.
          </p>
        </div>
        {state?.plan && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Audience</dt><dd className="font-medium">{state.plan.audience}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Language</dt><dd className="font-medium">{state.plan.language}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Pages</dt><dd className="font-medium">Home · {state.plan.pages.join(" · ")} · Contact</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Look and feel</dt><dd className="font-medium">{state.plan.lookAndFeel}</dd></div>
            {state.plan.assumptions && state.plan.assumptions.length > 0 && (
              <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">What we had to guess (correct it in the brief below if it is wrong)</dt><dd><ul className="list-disc space-y-0.5 pl-5 font-medium">{state.plan.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></dd></div>
            )}
          </dl>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Brief</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={12}
            disabled={!canGenerate || running}
            placeholder={"For example: A simple website for my vegetable cart in Hinglish. Pages: what's fresh today, how to order on WhatsApp, offers. Bright green and yellow. Big friendly text for customers who don't read much."}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-relaxed"
          />
        </label>
        {canGenerate && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={build} disabled={running}>
              {running ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {!state?.plan ? (hasPrompt ? "Build from my brief" : "Write my website") : changed ? "Build from my changes" : "Write the content again"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {!state?.plan ? "Empty brief: we write it from your business categories." : changed ? "Your edits change the plan: pages, names, language and tone." : "Same plan, fresh content. Theme and photos stay."}
            </span>
          </div>
        )}
        {local && <p role="status" className={local.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{local.text}</p>}
      </GlassCard>

      {state?.summary && (
        <GlassCard className="space-y-3 p-5">
          <p className="text-sm font-bold text-foreground">What was built</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Style</dt><dd className="font-medium">{state.summary.mood}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Pages published</dt><dd className="font-medium">{state.summary.pages} · {state.summary.images} photos</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Offerings written</dt><dd className="font-medium">{state.summary.services.join(" · ")}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Brand colour</dt><dd className="flex items-center gap-2 font-medium"><span className="size-4 rounded-full border" style={{ background: state.summary.theme.primary }} />{state.summary.theme.primary}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Layout</dt><dd className="font-medium">{state.summary.theme.header} header · {state.summary.theme.footer} footer</dd></div>
            {state.summary.checks && (
              <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Checks before publishing</dt><dd className="font-medium">{state.summary.checks.issuesFound === 0 ? "Nothing invented or off-topic was found." : state.summary.checks.repaired ? `${state.summary.checks.issuesFound} problem(s) found and fixed.` : `${state.summary.checks.scrubbed} unproven statement(s) removed.`}</dd></div>
            )}
          </dl>
        </GlassCard>
      )}

      {versions.length > 0 && (
        <GlassCard className="space-y-3 p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground"><History className="size-4 text-primary" /> Version history</p>
          <p className="text-xs text-muted-foreground">Every time your website is written, it is saved here. Nothing is ever deleted — switch to any version whenever you like.</p>
          <ul className="divide-y divide-border">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 space-y-0.5 text-sm">
                  <p className="font-semibold text-foreground">
                    Version {v.number}
                    {v.current && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">Live now</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {when(v.createdAt)} · {v.source === "restored" ? `Switched back to version ${v.restoredFrom}` : "Written by AI"}{v.model ? ` · ${v.model}` : ""} · {v.pages} pages
                  </p>
                  {v.mood && <p className="text-xs text-muted-foreground">{v.mood}</p>}
                  {v.services.length > 0 && <p className="line-clamp-1 text-xs text-muted-foreground">{v.services.join(" · ")}</p>}
                </div>
                {canGenerate && !v.current && (
                  <Button size="sm" variant="outline" onClick={() => restore(v)} disabled={running}>
                    <RotateCcw className="size-3.5" /> Switch to this version
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </div>
  );
}
