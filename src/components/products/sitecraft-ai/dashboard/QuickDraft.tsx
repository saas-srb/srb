"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { quickDraftAction } from "@/app/(products)/sitecraft-ai/(protected)/collections/actions";

/** WordPress-style "Quick Draft": start a blog post from the dashboard with just a title. */
export default function QuickDraft({ recent }: { recent: { slug: string; title: string; edited: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await quickDraftAction("blog", title);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Draft saved — opening the editor");
      router.push(`/sitecraft-ai/collections/blog/${res.slug}`);
    });
  };

  return (
    <GlassCard interactive={false} className="h-full space-y-4 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <PenSquare className="size-4 text-primary" /> Quick Draft
      </p>
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor="quick-draft-title" className="text-xs text-muted-foreground">New blog post title</label>
        <Input id="quick-draft-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 5 ways AI automation saves your team time" maxLength={140} />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">Saved as an unpublished draft.</p>
          <Button type="submit" size="sm" disabled={pending || !title.trim()}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} Save draft
          </Button>
        </div>
      </form>
      {recent.length > 0 && (
        <div className="border-t border-border/60 pt-3">
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your recent drafts</p>
          <ul className="space-y-1">
            {recent.map((d) => (
              <li key={d.slug} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/sitecraft-ai/collections/blog/${d.slug}`} className="truncate text-foreground hover:text-primary">{d.title || d.slug}</Link>
                <span className="shrink-0 text-xs text-muted-foreground">{d.edited}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
