"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, XCircle, AlertTriangle, RotateCcw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { validateRobots, isAllowed } from "@/lib/products/rankmax-ai/robots-parse";
import { publishRobotsAction } from "@/app/(products)/rankmax-ai/(protected)/actions";

export default function RobotsEditor({
  initial,
  managed,
  defaultText,
  primaryHost,
  importantPaths,
  canEdit,
  revisions,
}: {
  initial: string;
  managed: boolean;
  /** The code-default file (a revision with no content = "serve the default"). */
  defaultText: string;
  primaryHost: string;
  importantPaths: string[];
  canEdit: boolean;
  revisions: { content: string | null; at: string; byEmail: string | null; note: string }[];
}) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [note, setNote] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [testPath, setTestPath] = useState("/services");
  const [testAgent, setTestAgent] = useState("Googlebot");
  const [rule, setRule] = useState({ agent: "*", type: "Disallow", path: "" });
  const [pending, startTransition] = useTransition();

  const v = useMemo(() => validateRobots(text, { primaryHost, importantPaths }), [text, primaryHost, importantPaths]);
  const errors = v.problems.filter((p) => p.level === "error");
  const warnings = v.problems.filter((p) => p.level === "warning");
  const verdict = useMemo(() => {
    const p = testPath.trim().startsWith("/") ? testPath.trim() : `/${testPath.trim()}`;
    return isAllowed(v.parsed, p, testAgent);
  }, [v.parsed, testPath, testAgent]);
  const blockingErrors = errors.filter((e) => !(v.blocksEverything && e.message.startsWith("This file blocks the home page")));
  const dirty = text !== initial;

  function publish(content: string | null) {
    startTransition(async () => {
      const res = await publishRobotsAction(content, { confirmBlockAll: confirmAll, note });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(content === null ? "Reverted to the code default" : "robots.txt published");
        setNote("");
        router.refresh();
      }
    });
  }

  function addRule() {
    const path = rule.path.trim();
    if (!path) return;
    const lines = text.replace(/\s+$/, "").split("\n");
    const idx = lines.findIndex((l) => l.trim().toLowerCase() === `user-agent: ${rule.agent.toLowerCase()}`);
    const line = `${rule.type}: ${path.startsWith("/") || path.startsWith("*") ? path : `/${path}`}`;
    if (idx === -1) {
      const sitemapIdx = lines.findIndex((l) => /^sitemap:/i.test(l.trim()));
      const block = [`User-agent: ${rule.agent}`, line, ""];
      if (sitemapIdx === -1) lines.push("", ...block);
      else lines.splice(sitemapIdx, 0, ...block);
    } else {
      let end = idx + 1;
      while (end < lines.length && lines[end].trim() && !/^user-agent:/i.test(lines[end].trim())) end++;
      lines.splice(end, 0, line);
    }
    setText(`${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`);
    setRule((r) => ({ ...r, path: "" }));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/40 bg-card/90 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="robots-text" className="text-sm font-bold">robots.txt</Label>
            <div className="flex items-center gap-2 text-xs">
              <Badge className={managed ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}>{managed ? "Managed in product" : "Code default"}</Badge>
              {dirty && <Badge className="bg-amber-500/15 text-amber-700">Unpublished changes</Badge>}
            </div>
          </div>
          <Textarea id="robots-text" value={text} onChange={(e) => setText(e.target.value)} rows={18} spellCheck={false} readOnly={!canEdit} className="font-mono text-xs leading-relaxed" />
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="w-32 space-y-1"><Label className="text-[11px] text-muted-foreground">User-agent</Label><Input value={rule.agent} onChange={(e) => setRule((r) => ({ ...r, agent: e.target.value }))} className="h-8" /></div>
              <div className="w-32 space-y-1"><Label className="text-[11px] text-muted-foreground">Rule</Label><OptionSelect value={rule.type} onChange={(x) => setRule((r) => ({ ...r, type: x || "Disallow" }))} options={[{ value: "Disallow", label: "Disallow" }, { value: "Allow", label: "Allow" }]} aria-label="Rule type" /></div>
              <div className="min-w-40 flex-1 space-y-1"><Label className="text-[11px] text-muted-foreground">Path</Label><Input value={rule.path} onChange={(e) => setRule((r) => ({ ...r, path: e.target.value }))} placeholder="/private/" className="h-8" /></div>
              <Button type="button" size="sm" variant="outline" onClick={addRule}><Plus className="size-3.5" data-icon="inline-start" />Add rule</Button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/40 bg-card/90 p-4">
          <p className="mb-2 text-sm font-bold">Validation</p>
          {errors.length === 0 && warnings.length === 0 && <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="size-4" />Valid — no problems found.</p>}
          <ul className="space-y-1 text-sm">
            {errors.map((p, i) => <li key={`e${i}`} className="flex gap-2 text-rose-600"><XCircle className="mt-0.5 size-4 shrink-0" />{p.line ? `Line ${p.line}: ` : ""}{p.message}</li>)}
            {warnings.map((p, i) => <li key={`w${i}`} className="flex gap-2 text-amber-600"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{p.line ? `Line ${p.line}: ` : ""}{p.message}</li>)}
          </ul>
        </div>

        {canEdit && (
          <div className="space-y-3 rounded-2xl border border-border/40 bg-card/90 p-4">
            <div className="space-y-1"><Label htmlFor="robots-note">Change note</Label><Input id="robots-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this change? (kept in the history)" maxLength={200} /></div>
            {v.blocksEverything && (
              <label className="flex items-start gap-2 rounded-lg bg-rose-500/10 p-2 text-sm text-rose-700 dark:text-rose-300">
                <input type="checkbox" className="mt-0.5 size-4" checked={confirmAll} onChange={(e) => setConfirmAll(e.target.checked)} />
                I understand this blocks the entire site from search engines and want to publish it anyway.
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending || blockingErrors.length > 0 || (v.blocksEverything && !confirmAll) || !dirty} onClick={() => publish(text)}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : "Publish to live site"}
              </Button>
              <Button type="button" variant="outline" disabled={pending || !dirty} onClick={() => setText(initial)}>Discard changes</Button>
              {managed && (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => publish(null)}>
                  <RotateCcw className="size-3.5" data-icon="inline-start" />Revert to code default
                </Button>
              )}
            </div>
            {blockingErrors.length > 0 && <p className="text-xs text-rose-600">Fix the errors above before publishing.</p>}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border/40 bg-card/90 p-4 space-y-3">
          <p className="text-sm font-bold">Test a URL</p>
          <div className="space-y-1"><Label htmlFor="rt-path" className="text-xs">Path</Label><Input id="rt-path" value={testPath} onChange={(e) => setTestPath(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Crawler</Label><OptionSelect value={testAgent} onChange={(x) => setTestAgent(x || "Googlebot")} options={["Googlebot", "Googlebot-Image", "Bingbot", "DuckDuckBot", "GPTBot", "SomeOtherBot"].map((x) => ({ value: x, label: x }))} aria-label="Crawler" /></div>
          <div className={verdict.allowed ? "rounded-lg bg-emerald-500/10 p-2 text-sm text-emerald-700 dark:text-emerald-300" : "rounded-lg bg-rose-500/10 p-2 text-sm text-rose-700 dark:text-rose-300"}>
            <strong>{verdict.allowed ? "Allowed" : "Blocked"}</strong>
            <span className="block text-xs">{verdict.rule ? `Matched line ${verdict.rule.line}: ${verdict.rule.type === "allow" ? "Allow" : "Disallow"}: ${verdict.rule.path}` : "No rule matches"} {verdict.agentGroup ? `(group: ${verdict.agentGroup})` : "(no group applies)"}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Uses Google&apos;s matching rules: most specific user-agent group, longest matching path, Allow wins ties, * and $ wildcards.</p>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card/90 p-4">
          <p className="mb-2 text-sm font-bold">Preview</p>
          {v.parsed.groups.map((g, i) => (
            <div key={i} className="mb-2 rounded-lg bg-muted/50 p-2 text-xs">
              <p className="font-semibold">User-agent: {g.userAgents.join(", ")}</p>
              {g.rules.length === 0 && <p className="text-muted-foreground">Allows everything</p>}
              {g.rules.map((r) => <p key={r.line} className={r.type === "allow" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}>{r.type === "allow" ? "✓ Allow" : "✗ Disallow"} {r.path}</p>)}
              {g.crawlDelay !== null && <p className="text-muted-foreground">Crawl-delay {g.crawlDelay}</p>}
            </div>
          ))}
          {v.parsed.sitemaps.map((s) => <p key={s} className="truncate text-xs text-muted-foreground">Sitemap: {s}</p>)}
        </div>

        <div className="rounded-2xl border border-border/40 bg-card/90 p-4">
          <p className="mb-2 text-sm font-bold">History</p>
          {revisions.length === 0 ? <p className="text-xs text-muted-foreground">No published versions yet.</p> : (
            <ul className="space-y-2 text-xs">
              {revisions.map((r, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block">Replaced {r.at} by {r.byEmail ?? "—"}</span>
                    {r.note && <span className="block text-muted-foreground">“{r.note}”</span>}
                  </span>
                  {canEdit && <Button type="button" size="xs" variant="outline" onClick={() => setText(r.content ?? defaultText)}>Load</Button>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">Each entry is the version that was live before that publish. “Load” puts it in the editor; publish to restore it.</p>
        </div>
      </div>
    </div>
  );
}
