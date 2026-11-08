"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteArticleAction, saveArticleAction } from "../../actions";
import type { ArticleInput } from "@/lib/support/articles";

const INPUT = "w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const L = ({ children }: { children: React.ReactNode }) => <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>;

export default function ArticleEditor({ initial, canManage }: { initial: ArticleInput; canManage: boolean }) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof ArticleInput>(k: K, v: ArticleInput[K]) => setA((s) => ({ ...s, [k]: v }));

  function save(status: "draft" | "published") {
    start(async () => {
      const res = await saveArticleAction({ ...a, status });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(status === "published" ? "Published" : "Saved as draft");
      if (!a.id) router.replace(`/console/resolveiq/help/${res.id}`);
      else {
        set("status", status);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/50 bg-card p-5">
      <div><L>Title</L><input value={a.title} onChange={(e) => set("title", e.target.value)} maxLength={140} className={INPUT} disabled={!canManage} /></div>
      <div><L>Short summary (shown in lists)</L><input value={a.summary} onChange={(e) => set("summary", e.target.value)} maxLength={300} className={INPUT} disabled={!canManage} /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><L>Category</L><input value={a.category} onChange={(e) => set("category", e.target.value)} placeholder="Getting started" className={INPUT} disabled={!canManage} /></div>
        <div><L>Tags (comma separated)</L><input value={a.tags} onChange={(e) => set("tags", e.target.value)} className={INPUT} disabled={!canManage} /></div>
        <div><L>Products it covers (e.g. pms, hrms)</L><input value={a.panels} onChange={(e) => set("panels", e.target.value)} className={INPUT} disabled={!canManage} /></div>
      </div>
      <div><L>Content (Markdown supported)</L><textarea value={a.body} onChange={(e) => set("body", e.target.value)} rows={16} maxLength={20000} className={`${INPUT} font-mono text-xs`} disabled={!canManage} /></div>
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {a.id ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { const r = await deleteArticleAction(a.id!); if (!r.ok) { toast.error(r.error); return; } toast.success("Deleted"); router.replace("/console/resolveiq/help"); })}><Trash2 className="size-3.5" /> Delete</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pending} onClick={() => save("draft")}>Save draft</Button>
            <Button size="sm" disabled={pending} onClick={() => save("published")}>{pending && <Loader2 className="size-3.5 animate-spin" />} {a.status === "published" ? "Save & keep published" : "Publish"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
