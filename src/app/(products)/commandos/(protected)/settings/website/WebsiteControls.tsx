"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addOpeningAction, saveWebsiteAction, setOpeningOpenAction } from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; redirectTo?: string }>, done: string, after?: () => void) =>
    start(async () => {
      const r = await fn().catch(() => ({ ok: false, error: "Could not save. Try again." }));
      if (!r.ok) {
        toast.error(r.error ?? "Could not save.");
        return;
      }
      toast.success(done);
      if ("redirectTo" in r && r.redirectTo) {
        window.location.assign(r.redirectTo); // the sign-in address moved
        return;
      }
      after?.();
      router.refresh();
    });
  return { pending, run };
}

const CHOICES = [
  { value: "platform", label: "Run my website here", text: "Your public website and its pages, edited in SiteCraft." },
  { value: "external", label: "I already have a website", text: "We don't publish one. Link or embed our forms in yours." },
  { value: "none", label: "No website", text: "Only the forms and links your products need." },
];

export function WebsiteChoice({ mode, externalUrl, canHost }: { mode: string; externalUrl: string; canHost: boolean }) {
  const { pending, run } = useRun();
  const [value, setValue] = useState(mode);
  const [url, setUrl] = useState(externalUrl);
  const choices = CHOICES.filter((c) => canHost || c.value !== "platform");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveWebsiteAction({ mode: value, externalUrl: url }), "Website setting saved");
      }}
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">Website</legend>
        {choices.map((c) => (
          <label key={c.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3 text-sm has-checked:border-primary has-checked:bg-primary/5">
            <input type="radio" name="website" className="mt-1" checked={value === c.value} onChange={() => setValue(c.value)} />
            <span>
              <span className="block font-semibold">{c.label}</span>
              <span className="block text-xs text-muted-foreground">{c.text}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {value === "external" && (
        <div className="space-y-1.5">
          <Label htmlFor="own-website">Your website&apos;s address</Label>
          <Input id="own-website" type="url" placeholder="https://www.example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
      </Button>
    </form>
  );
}

export function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold">{label}</p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border/60 bg-muted/60 px-2 py-1.5 text-xs whitespace-pre">{value}</code>
        <Button type="button" size="sm" variant="outline" aria-label={`Copy ${label}`} onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied"), () => toast.error("Could not copy."))}>
          <Copy className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function Openings({ rows }: { rows: { slug: string; title: string; category: string; isOpen: boolean }[] }) {
  const { pending, run } = useRun();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addOpeningAction({ title, category }), "Opening added", () => {
            setTitle("");
            setCategory("");
          });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="op-title">Job title</Label>
          <Input id="op-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="op-team">Team (optional)</Label>
          <Input id="op-team" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <Button type="submit" size="sm" disabled={pending || title.trim().length < 2}>
          Add opening
        </Button>
      </form>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No openings yet. People can still send a general application.</p>
      ) : (
        <ul className="divide-y divide-border/50 text-sm">
          {rows.map((r) => (
            <li key={r.slug} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{r.title}</span> <span className="text-muted-foreground">· {r.category}{r.isOpen ? "" : " · closed"}</span>
              </span>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => setOpeningOpenAction(r.slug, !r.isOpen), r.isOpen ? "Closed" : "Reopened")}>
                {r.isOpen ? "Close" : "Reopen"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
