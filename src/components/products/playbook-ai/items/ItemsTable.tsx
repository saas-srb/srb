"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ITEM_KIND_INFO, type ItemKind, type ItemRow } from "@/lib/products/playbook-ai/items-types";
import { copyItemAction, deleteItemAction, itemDetailsAction, previewItemAction, type ItemDetailsData } from "@/app/(products)/playbook-ai/(protected)/items-actions";
import { PdfPreviewDialog, SendChip, fmtDate } from "@/components/products/playbook-ai/items/shared";

const exportUrl = (id: string, format: "pdf" | "docx") => `/api/playbook-ai/documents/${encodeURIComponent(id)}/export?format=${format}&version=draft`;

function DetailsSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [data, setData] = useState<ItemDetailsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setData(null); setError(null);
    void itemDetailsAction(id).then((r) => { if (cancelled) return; if (r.ok) setData(r.data); else setError(r.message); });
    return () => { cancelled = true; };
  }, [id]);
  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{data?.title ?? "Details"}</SheetTitle>
          <SheetDescription>Information, versions and activity</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6 text-sm">
          {!data && !error && <p className="text-muted-foreground" role="status">Loading…</p>}
          {error && <p className="text-destructive" role="alert">{error}</p>}
          {data && (
            <>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                <dt className="text-muted-foreground">Type</dt><dd className="col-span-2">{ITEM_KIND_INFO[data.kind].singular}</dd>
                {data.meta.department && <><dt className="text-muted-foreground">Department</dt><dd className="col-span-2">{data.meta.department}</dd></>}
                {data.meta.designation && <><dt className="text-muted-foreground">Designation</dt><dd className="col-span-2">{data.meta.designation}</dd></>}
                {data.meta.reviewPeriod && <><dt className="text-muted-foreground">Review period</dt><dd className="col-span-2">{data.meta.reviewPeriod}</dd></>}
                {data.meta.description && <><dt className="text-muted-foreground">Description</dt><dd className="col-span-2">{data.meta.description}</dd></>}
                <dt className="text-muted-foreground">Created</dt><dd className="col-span-2">{fmtDate(data.createdAt)}</dd>
                <dt className="text-muted-foreground">Last changed</dt><dd className="col-span-2">{fmtDate(data.updatedAt)}</dd>
                <dt className="text-muted-foreground">ContractFlow</dt><dd className="col-span-2"><SendChip state={data.send?.state ?? null} />{data.send && <> <Link className="text-primary underline-offset-2 hover:underline" href={`/contractflow-ai/clones/${data.send.cloneId}`}>Open copy</Link></>}</dd>
              </dl>
              <section>
                <h3 className="mb-1 font-semibold">Sent to ContractFlow</h3>
                {data.sends.length === 0 ? <p className="text-muted-foreground">Not sent yet.</p> : (
                  <ul className="space-y-1">{data.sends.map((s) => <li key={s.cloneId}>{s.partyName}, version {s.versionNumber}, {fmtDate(s.sentAt)} · <Link className="text-primary underline-offset-2 hover:underline" href={`/contractflow-ai/clones/${s.cloneId}`}>open</Link></li>)}</ul>
                )}
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Versions</h3>
                {data.versions.length === 0 ? <p className="text-muted-foreground">No saved versions yet. A version is saved when the item is sent to ContractFlow.</p> : (
                  <ul className="space-y-1">{data.versions.map((v) => <li key={v.number}>Version {v.number}{v.label ? `, ${v.label}` : ""} · {v.by || "someone"} · {fmtDate(v.at)}</li>)}</ul>
                )}
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Activity</h3>
                {data.activity.length === 0 ? <p className="text-muted-foreground">No activity to show.</p> : (
                  <ul className="space-y-1">{data.activity.map((a, i) => <li key={i}>{a.summary} <span className="text-muted-foreground">· {a.by} · {fmtDate(a.at)}</span></li>)}</ul>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DeleteDialog({ row, onClose }: { row: ItemRow | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) { onClose(); setError(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this {row ? ITEM_KIND_INFO[row.kind].singular : "item"}?</DialogTitle>
          <DialogDescription>{row?.title}. It moves to the trash and can be restored by an administrator. Copies already in ContractFlow are not affected.</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={pending} onClick={() => start(async () => {
            const r = await deleteItemAction(row!.id);
            if (!r.ok) { setError(r.message); return; }
            toast.success("Deleted");
            onClose();
            router.refresh();
          })}>{pending ? "Deleting…" : "Delete"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowMenu({ row, primary, isDraft, cloneHref, canSend, canEdit, canExport, canDelete, onDetails, onPreview, onDelete }: {
  row: ItemRow; primary: { label: string; href: string } | null; isDraft: boolean; cloneHref: string | null;
  canSend: boolean; canEdit: boolean; canExport: boolean; canDelete: boolean;
  onDetails: () => void; onPreview: () => void; onDelete: () => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const duplicate = () => start(async () => {
    const r = await copyItemAction(row.id);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success("Copy created");
    router.push(`/playbook-ai/documents/${r.documentId}`);
  });
  // On a wide screen the primary buttons sit beside the menu; on a narrow one they move into it.
  const narrow = "md:hidden";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")} aria-label={`More actions for ${row.title}`} disabled={busy}>
        <MoreHorizontal aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {primary && <DropdownMenuItem className={narrow} render={<Link href={primary.href} />}>{primary.label}</DropdownMenuItem>}
        {isDraft && canSend && <DropdownMenuItem className={narrow} render={<Link href={`/playbook-ai/documents/${row.id}/send`} />}>Send to ContractFlow</DropdownMenuItem>}
        <DropdownMenuItem onClick={onPreview}>Preview (PDF)</DropdownMenuItem>
        <DropdownMenuItem onClick={onDetails}>Details</DropdownMenuItem>
        {canEdit && !(isDraft) && <DropdownMenuItem render={<Link href={`/playbook-ai/documents/${row.id}`} />}>Edit</DropdownMenuItem>}
        {cloneHref && primary?.href !== cloneHref && <DropdownMenuItem render={<Link href={cloneHref} />}>Open in ContractFlow</DropdownMenuItem>}
        {canEdit && <DropdownMenuItem onClick={duplicate}>Duplicate</DropdownMenuItem>}
        {canExport && <DropdownMenuSeparator />}
        {canExport && <DropdownMenuItem render={<a href={exportUrl(row.id, "pdf")} download />}>Download PDF</DropdownMenuItem>}
        {canExport && <DropdownMenuItem render={<a href={exportUrl(row.id, "docx")} download />}>Download Word</DropdownMenuItem>}
        {canDelete && <DropdownMenuSeparator />}
        {canDelete && <DropdownMenuItem variant="destructive" onClick={onDelete}>Delete</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ItemsTable({ rows, kind, canSend, canEdit, canExport, canDelete, emptyText }: { rows: ItemRow[]; kind: ItemKind; canSend: boolean; canEdit: boolean; canExport: boolean; canDelete: boolean; emptyText: string }) {
  const [details, setDetails] = useState<string | null>(null);
  const [preview, setPreview] = useState<ItemRow | null>(null);
  const [del, setDel] = useState<ItemRow | null>(null);
  const info = ITEM_KIND_INFO[kind];

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/60 p-10 text-center">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button nativeButton={false} render={<Link href={`/playbook-ai/${info.segment}/library`} />} variant="outline">Open the {info.library}</Button>
          {canEdit && <Button nativeButton={false} render={<Link href={`/playbook-ai/${info.segment}/new`} />}>{info.create}</Button>}
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Updated</th>
                <th className="w-px whitespace-nowrap px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r) => {
                const sub = (kind === "kpi" ? r.designation : r.department) || "";
                const isDraft = !r.send;
                const signed = r.send?.state === "signed";
                const editHref = `/playbook-ai/documents/${r.id}`;
                const cloneHref = r.send ? `/contractflow-ai/clones/${r.send.cloneId}` : null;
                // One primary action by status; the rest live in the menu.
                const primary: { label: string; href: string } | null = isDraft ? (canEdit ? { label: "Edit", href: editHref } : null) : cloneHref ? { label: signed ? "View signed" : "View status", href: cloneHref } : null;
                return (
                  <tr key={r.id} className="align-middle hover:bg-muted/20">
                    <td className="px-4 py-3">
                      {isDraft && canEdit
                        ? <Link href={editHref} className="font-semibold hover:text-primary hover:underline">{r.title}</Link>
                        : <button type="button" className="text-left font-semibold hover:text-primary hover:underline" onClick={() => setDetails(r.id)}>{r.title}</button>}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[sub || null, r.send ? `For ${r.send.partyName}${r.send.copies > 1 ? `, ${r.send.copies} copies sent` : ""}` : null].filter(Boolean).join(" · ") || "\u00a0"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <SendChip state={r.send?.state ?? null} />
                        {r.versionCount > 0 && <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground" title={`${r.versionCount} saved version${r.versionCount === 1 ? "" : "s"}`}>v{r.versionCount}</span>}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{fmtDate(r.updatedAt)}{r.updatedBy ? <><br /><span className="text-xs">{r.updatedBy}</span></> : null}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        {primary && <Button size="sm" variant="outline" className="hidden md:inline-flex" nativeButton={false} render={<Link href={primary.href} />}>{primary.label}</Button>}
                        {isDraft && canSend && <Button size="sm" className="hidden md:inline-flex" nativeButton={false} render={<Link href={`/playbook-ai/documents/${r.id}/send`} />}>Send to ContractFlow</Button>}
                        <RowMenu
                          row={r} primary={primary} isDraft={isDraft} cloneHref={cloneHref}
                          canSend={canSend} canEdit={canEdit} canExport={canExport} canDelete={canDelete}
                          onDetails={() => setDetails(r.id)} onPreview={() => setPreview(r)} onDelete={() => setDel(r)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <DetailsSheet id={details} onClose={() => setDetails(null)} />
      {preview && <PdfPreviewDialog open title={preview.title} onClose={() => setPreview(null)} load={() => previewItemAction(preview.id)} />}
      <DeleteDialog row={del} onClose={() => setDel(null)} />
    </>
  );
}
