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
import type { PartyType } from "@/lib/products/contractflow-ai/party-types";
import { PARTY_TYPE_LABEL } from "@/lib/products/contractflow-ai/party-types";
import { type SendState } from "@/lib/products/playbook-ai/items-types";
import { cloneDetailsAction, deleteCloneAction, previewCloneAction, resendCloneAction, type CloneDetails } from "@/app/(products)/contractflow-ai/(protected)/clones/list-actions";
import { FIELD, PdfPreviewDialog, SendChip, fmtDate } from "@/components/products/playbook-ai/items/shared";

export interface CloneRow {
  id: string;
  title: string;
  kind: string;
  state: SendState;
  partyName: string;
  partyType: PartyType;
  partyId: string | null;
  updatedAt: string;
  requestId: string | null;
  signerPlan: { name: string; email: string; role: "company_signatory" | "counterparty" | "witness" | "approver" }[];
  canEdit: boolean;
  canSend: boolean;
  canVoid: boolean;
  canDelete: boolean;
  replaces: boolean;
}

function Details({ id, onClose }: { id: string | null; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<CloneDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setData(null); setError(null);
    void cloneDetailsAction(id).then((r) => { if (cancelled) return; if (r.ok) setData(r.data); else setError(r.message); });
    return () => { cancelled = true; };
  }, [id]);
  async function resend(signerId: string) {
    if (!id) return;
    setBusy(signerId);
    const r = await resendCloneAction(id, signerId);
    setBusy(null);
    if (r.ok) toast.success(r.message); else toast.error(r.message);
    router.refresh();
  }
  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{data?.title ?? "Details"}</SheetTitle><SheetDescription>Status, signers and tracking</SheetDescription></SheetHeader>
        <div className="space-y-5 px-4 pb-6 text-sm">
          {!data && !error && <p className="text-muted-foreground" role="status">Loading…</p>}
          {error && <p className="text-destructive" role="alert">{error}</p>}
          {data && (
            <>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                <dt className="text-muted-foreground">Status</dt><dd className="col-span-2">{data.statusLabel}</dd>
                <dt className="text-muted-foreground">For</dt><dd className="col-span-2">{data.partyName} ({PARTY_TYPE_LABEL[data.partyType as PartyType] ?? data.partyType})</dd>
                <dt className="text-muted-foreground">Version</dt><dd className="col-span-2">{data.rev} (copied from Playbook version {data.source.versionNumber})</dd>
                <dt className="text-muted-foreground">Created</dt><dd className="col-span-2">{fmtDate(data.createdAt)}</dd>
                <dt className="text-muted-foreground">Updated</dt><dd className="col-span-2">{fmtDate(data.updatedAt)}</dd>
                {data.expiresAt && <><dt className="text-muted-foreground">Links expire</dt><dd className="col-span-2">{fmtDate(data.expiresAt)}</dd></>}
                {data.voidReason && <><dt className="text-muted-foreground">Voided</dt><dd className="col-span-2">{data.voidReason}</dd></>}
              </dl>
              <section>
                <h3 className="mb-1 font-semibold">Signers</h3>
                {data.signers.length === 0 ? <p className="text-muted-foreground">No signers set yet. Add them when you send it.</p> : (
                  <ul className="space-y-2">
                    {data.signers.map((s) => (
                      <li key={s.id} className="rounded-md border p-2">
                        <p className="font-medium">{s.name} <span className="font-normal text-muted-foreground">· {s.email}</span></p>
                        <p className="text-xs text-muted-foreground">{s.status === "planned" ? "Not sent yet" : s.status === "signed" && s.signedAt ? `Signed ${fmtDate(s.signedAt)}` : s.status === "declined" ? `Declined: ${s.declineReason ?? ""}` : s.viewedAt ? `Opened ${fmtDate(s.viewedAt)}` : "Not opened yet"}</p>
                        {data.requestStatus && !["signed", "declined"].includes(s.status) && ["sent", "in_progress"].includes(data.requestStatus) && <Button size="sm" variant="outline" className="mt-1" disabled={busy === s.id} onClick={() => void resend(s.id)}>{busy === s.id ? "Sending…" : "Resend"}</Button>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {data.events.length > 0 && <section><h3 className="mb-1 font-semibold">Tracking</h3><ul className="space-y-0.5 text-xs">{data.events.map((e, i) => <li key={i}>{fmtDate(e.at)}: {e.type.replace(/_/g, " ")}</li>)}</ul></section>}
              <Link className="text-primary underline-offset-2 hover:underline" href={`/contractflow-ai/clones/${data.id}?tab=versions`}>Versions and comparison</Link>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function CloneTable({ rows, emptyText }: { rows: CloneRow[]; emptyText: string }) {
  const router = useRouter();
  const [details, setDetails] = useState<string | null>(null);
  const [preview, setPreview] = useState<CloneRow | null>(null);
  const [del, setDel] = useState<CloneRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (rows.length === 0) return <div className="rounded-2xl border border-dashed border-border/60 bg-card/60 p-10 text-center text-sm text-muted-foreground">{emptyText}</div>;
  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">For</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Updated</th>
                <th className="w-px whitespace-nowrap px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r) => {
                const open = `/contractflow-ai/clones/${r.id}`;
                const isDraft = r.state === "clone_draft" || r.state === "ready";
                // One primary action by status; Send (when allowed) is the one other button; everything else is in the menu.
                const primary: { label: string; href: string } | null = isDraft ? (r.canEdit ? { label: "Edit", href: open } : null) : { label: r.state === "signed" ? "View signed" : "View status", href: open };
                const sendLabel = isDraft ? "Send" : "Send again";
                return (
                  <tr key={r.id} className="align-middle hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link href={open} className="font-semibold hover:text-primary hover:underline">{r.title}</Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.replaces ? "Replaces an earlier document" : <span className="sm:hidden">{r.partyName}</span>}</p>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{r.partyName}<br /><span className="text-xs">{PARTY_TYPE_LABEL[r.partyType]}</span></td>
                    <td className="whitespace-nowrap px-4 py-3"><SendChip state={r.state} /></td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{fmtDate(r.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        {primary && <Button size="sm" variant="outline" className="hidden md:inline-flex" nativeButton={false} render={<Link href={primary.href} />}>{primary.label}</Button>}
                        {r.canSend && <Button size="sm" className="hidden md:inline-flex" nativeButton={false} render={<Link href={`/contractflow-ai/clones/${r.id}/send`} />}>{sendLabel}</Button>}
                        <DropdownMenu>
                          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")} aria-label={`More actions for ${r.title}`}>
                            <MoreHorizontal aria-hidden />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-48">
                            {primary && <DropdownMenuItem className="md:hidden" render={<Link href={primary.href} />}>{primary.label}</DropdownMenuItem>}
                            {r.canSend && <DropdownMenuItem className="md:hidden" render={<Link href={`/contractflow-ai/clones/${r.id}/send`} />}>{sendLabel}</DropdownMenuItem>}
                            <DropdownMenuItem onClick={() => setPreview(r)}>Preview (PDF)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDetails(r.id)}>Details</DropdownMenuItem>
                            {r.canEdit && !isDraft && <DropdownMenuItem render={<Link href={open} />}>Edit</DropdownMenuItem>}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem render={<a href={`/api/contractflow-ai/clones/${r.id}/file?format=pdf`} download />}>Download PDF</DropdownMenuItem>
                            <DropdownMenuItem render={<a href={`/api/contractflow-ai/clones/${r.id}/file?format=docx`} download />}>Download Word</DropdownMenuItem>
                            {(r.canVoid || r.canDelete) && <DropdownMenuSeparator />}
                            {r.canVoid && <DropdownMenuItem render={<Link href={`/contractflow-ai/clones/${r.id}/void`} />}>Void…</DropdownMenuItem>}
                            {r.canDelete && <DropdownMenuItem variant="destructive" onClick={() => { setDel(r); setError(null); }}>Delete</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Details id={details} onClose={() => setDetails(null)} />
      {preview && <PdfPreviewDialog open title={preview.title} onClose={() => setPreview(null)} load={() => previewCloneAction(preview.id)} />}
      <Dialog open={!!del} onOpenChange={(o) => { if (!o) setDel(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this document?</DialogTitle><DialogDescription>{del?.title}. It leaves the lists and any open signing links stop working. Playbook is not affected.</DialogDescription></DialogHeader>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter><Button variant="ghost" onClick={() => setDel(null)}>Cancel</Button><Button variant="destructive" disabled={pending} onClick={() => start(async () => { const r = await deleteCloneAction(del!.id); if (!r.ok) { setError(r.message); return; } toast.success("Deleted"); setDel(null); router.refresh(); })}>{pending ? "Deleting…" : "Delete"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
