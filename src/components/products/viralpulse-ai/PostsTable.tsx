"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Archive, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KindChip, PlatformChip, StatusBadge } from "@/components/products/viralpulse-ai/SmmsBits";
import { archivePostAction, deletePostAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import type { PostPlatform } from "@/lib/products/viralpulse-ai/constants";

export interface PostRow {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  needsApproval: boolean;
  contentType: "image" | "video";
  platforms: { platform: PostPlatform; account: string | null; state: "pending" | "published" | "failed" }[];
  when: string;
  updated: string;
}

/** The posts list with row selection and bulk archive / delete (each post goes through the same checked action as a single one). */
export default function PostsTable({ rows, canManage }: { rows: PostRow[]; canManage: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | "archive" | "delete">(null);
  const [pending, start] = useTransition();
  const all = rows.length > 0 && sel.size === rows.length;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function run(kind: "archive" | "delete") {
    start(async () => {
      let ok = 0;
      const fails: string[] = [];
      for (const id of sel) {
        const r = kind === "archive" ? await archivePostAction(id, true) : await deletePostAction(id);
        if (r.ok) ok++;
        else fails.push(`${rows.find((x) => x.id === id)?.title ?? id}: ${r.error}`);
      }
      setConfirm(null);
      setSel(new Set());
      if (ok) toast.success(`${ok} post${ok === 1 ? "" : "s"} ${kind === "archive" ? "archived" : "deleted"}.`);
      if (fails.length) toast.error(fails.slice(0, 3).join(" | "));
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {canManage && sel.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-semibold">{`${sel.size} selected`}</span>
          <Button type="button" size="xs" variant="outline" onClick={() => setConfirm("archive")}><Archive className="size-3" /> Archive</Button>
          <Button type="button" size="xs" variant="outline" onClick={() => setConfirm("delete")}><Trash2 className="size-3" /> Delete</Button>
          <Button type="button" size="xs" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {canManage && <TableHead className="w-8"><input type="checkbox" aria-label="Select all posts on this page" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} className="size-4 accent-[var(--primary)]" /></TableHead>}
            <TableHead>Post</TableHead><TableHead>Platforms and accounts</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead><TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} data-state={sel.has(r.id) ? "selected" : undefined}>
              {canManage && <TableCell><input type="checkbox" aria-label={`Select ${r.title}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-[var(--primary)]" /></TableCell>}
              <TableCell className="max-w-sm">
                <Link href={`/viralpulse-ai/posts/${r.id}`} className="font-medium hover:text-primary">{r.title}</Link>
                <p className="truncate text-[11px] text-muted-foreground">{r.subtitle}</p>
              </TableCell>
              <TableCell>
                <ul className="space-y-1">
                  {r.platforms.map((p) => (
                    <li key={p.platform} className="flex items-center gap-1.5">
                      <PlatformChip platform={p.platform} />
                      <span className="truncate text-[11px] text-muted-foreground">{p.account ?? "default account"}{p.state === "published" ? " · published" : p.state === "failed" ? " · failed" : ""}</span>
                    </li>
                  ))}
                </ul>
              </TableCell>
              <TableCell><KindChip kind={r.contentType} /></TableCell>
              <TableCell><StatusBadge status={r.status} />{r.needsApproval && <p className="text-[10px] text-amber-600">needs approval</p>}</TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.when}</TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.updated}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "delete" ? `Delete ${sel.size} post${sel.size === 1 ? "" : "s"}?` : `Archive ${sel.size} post${sel.size === 1 ? "" : "s"}?`}</DialogTitle>
            <DialogDescription>{confirm === "delete" ? "They are removed from the list. Published posts can only be archived, not deleted, unless you can delete campaigns." : "Archived posts leave the lists and any schedule is withdrawn. You can restore them later."}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)} disabled={pending}>Cancel</Button>
            <Button type="button" variant={confirm === "delete" ? "destructive" : "default"} onClick={() => confirm && run(confirm)} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : null} {confirm === "delete" ? "Delete" : "Archive"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
