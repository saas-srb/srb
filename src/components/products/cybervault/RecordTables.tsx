"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Copy, Download, Eye, EyeOff, ExternalLink, History, Loader2, Pencil, Trash2, Upload, FileText, KeyRound, Link2, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import ActionButton from "@/components/products/cybervault/ActionButton";
import { EmptyState, ExpiryBadge, OwnerBadge, StatusBadge } from "@/components/products/cybervault/DlmsUi";
import { CredentialDialog, DocumentDialog, LinkDialog, NoteDialog, ReplaceDocumentDialog } from "@/components/products/cybervault/RecordDialogs";
import { canWriteRow, type LockedOwner, type VaultUi } from "@/components/products/cybervault/vault-types";
import { CREDENTIAL_TYPES, DOCUMENT_CATEGORIES, LINK_TYPES, NOTE_TYPES, labelOf, type RecordType } from "@/lib/products/cybervault/constants";
import type { CredentialRow, DocumentRow, LinkRow, NoteRow, RowBase } from "@/lib/products/cybervault/records";
import { deleteRecordAction, revealCredentialAction, setStatusAction } from "@/app/(products)/cybervault/(protected)/actions";
import { formatDate, formatDateTime } from "@/lib/utils";

interface CommonProps {
  ui: VaultUi;
  /** Set on a client / company profile page: the owner column is hidden and forms are pre-owned. */
  locked?: LockedOwner;
}

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Archive/restore + delete for any record type. Edit is passed in (it is a type-specific dialog). */
function RowActions({ type, row, ui, edit, extra }: { type: RecordType; row: RowBase; ui: VaultUi; edit?: ReactNode; extra?: ReactNode }) {
  const writable = canWriteRow(ui, row.scope, row.clientId);
  const noun = { credential: "credential", document: "document", link: "URL / account", note: "note" }[type];
  return (
    <div className="flex items-center justify-end gap-1">
      {extra}
      {writable && ui.edit && edit}
      {writable && ui.edit && (
        <ActionButton
          variant="ghost"
          size="icon-xs"
          aria-label={row.status === "archived" ? "Restore" : "Archive"}
          success={row.status === "archived" ? "Restored" : "Archived"}
          action={() => setStatusAction(type, row.id, row.status === "archived" ? "active" : "archived")}
        >
          {row.status === "archived" ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
        </ActionButton>
      )}
      {writable && ui.del && (
        <ActionButton
          variant="ghost"
          size="icon-xs"
          className="text-destructive hover:text-destructive"
          aria-label="Delete"
          success="Deleted"
          confirm={{ title: `Delete this ${noun}?`, description: `“${row.name}” will be removed from the vault. The deletion is recorded in the activity log.`, confirmLabel: "Delete" }}
          action={() => deleteRecordAction(type, row.id)}
        >
          <Trash2 className="size-3.5" />
        </ActionButton>
      )}
    </div>
  );
}

function NameCell({ row, category, icon }: { row: RowBase; category: string; icon: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {row.name} {row.status === "archived" && <StatusBadge status="archived" />}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{category}</p>
      </div>
    </div>
  );
}

function TableShell({ children, empty, isEmpty }: { children: ReactNode; empty: { title: string; hint: string; icon: ReactNode }; isEmpty: boolean }) {
  if (isEmpty) return <EmptyState icon={empty.icon} title={empty.title}>{empty.hint}</EmptyState>;
  return <div className="overflow-x-auto">{children}</div>;
}

const EXTERNAL = { target: "_blank", rel: "noopener noreferrer" } as const;

// ── Credentials ───────────────────────────────────────────────────────────

/** Masked by default. Show / Copy go through a server action that checks permission + scope and writes an audit entry (never the value). */
function SecretCell({ row, ui }: { row: CredentialRow; ui: VaultUi }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Auto re-mask. Only the effect's own cleanup clears the timer, so it is safe under Strict Mode.
  useEffect(() => {
    if (secret === null) return;
    const t = setTimeout(() => setSecret(null), ui.revealSeconds * 1000);
    return () => clearTimeout(t);
  }, [secret, ui.revealSeconds]);

  if (!row.hasPassword) return <span className="text-xs text-muted-foreground">Not stored</span>;

  function reveal() {
    startTransition(async () => {
      const res = await revealCredentialAction(row.id, "reveal");
      if (!res.ok) toast.error(res.error);
      else setSecret(res.secret);
    });
  }
  function copy() {
    startTransition(async () => {
      const res = await revealCredentialAction(row.id, "copy");
      if (!res.ok) return void toast.error(res.error);
      try {
        await navigator.clipboard.writeText(res.secret);
        toast.success("Password copied to the clipboard");
      } catch {
        toast.error("Your browser blocked clipboard access — use Show instead.");
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      <span className="min-w-24 font-mono text-xs select-all" aria-live="polite">
        {secret ?? "••••••••••"}
      </span>
      {ui.reveal && (
        <>
          <Button type="button" variant="ghost" size="icon-xs" disabled={pending} aria-label={secret ? "Hide password" : "Show password"} onClick={() => (secret ? setSecret(null) : reveal())}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : secret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={pending} aria-label="Copy password" onClick={copy}>
            <Copy className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

function CopyText({ text, label }: { text: string; label: string }) {
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      className="group inline-flex max-w-48 items-center gap-1 truncate text-left text-sm hover:text-primary"
      onClick={() => navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`), () => toast.error("Could not copy"))}
    >
      <span className="truncate">{text}</span>
      <Copy className="size-3 shrink-0 opacity-0 group-hover:opacity-60" />
    </button>
  );
}

export function CredentialsTable({ rows, ui, locked }: CommonProps & { rows: CredentialRow[] }) {
  return (
    <TableShell isEmpty={rows.length === 0} empty={{ icon: <KeyRound className="size-5" />, title: "No credentials found", hint: "Stored logins appear here, masked until someone with permission reveals them." }}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service / account</TableHead>
            {!locked && <TableHead>Belongs to</TableHead>}
            <TableHead>Username</TableHead>
            <TableHead>Password</TableHead>
            <TableHead>Login URL</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className={r.status === "archived" ? "opacity-60" : undefined}>
              <TableCell>
                <NameCell row={r} category={labelOf(CREDENTIAL_TYPES, r.category)} icon={<KeyRound className="size-4" />} />
                {r.notes && <p className="mt-0.5 line-clamp-1 max-w-64 pl-6 text-[11px] text-muted-foreground">{r.notes}</p>}
              </TableCell>
              {!locked && (
                <TableCell>
                  <OwnerBadge scope={r.scope} clientId={r.clientId} clientName={r.clientName} />
                </TableCell>
              )}
              <TableCell>{r.username ? <CopyText text={r.username} label="Username" /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
              <TableCell>
                <SecretCell row={r} ui={ui} />
                {r.passwordUpdatedAt && <p className="text-[10px] text-muted-foreground">Updated {formatDate(r.passwordUpdatedAt)}</p>}
              </TableCell>
              <TableCell>
                {r.loginUrl ? (
                  <a href={r.loginUrl} {...EXTERNAL} className="inline-flex max-w-40 items-center gap-1 truncate text-sm text-primary hover:underline">
                    <span className="truncate">{r.loginUrl.replace(/^https?:\/\//, "")}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <ExpiryBadge state={r.expiry} date={r.expiryDate} />
              </TableCell>
              <TableCell>
                <RowActions
                  type="credential"
                  row={r}
                  ui={ui}
                  edit={
                    <CredentialDialog ui={ui} locked={locked} initial={r} trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label="Edit"><Pencil className="size-3.5" /></Button>} />
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableShell>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────

const fileUrl = (id: string, v?: number, download?: boolean) => `/api/cybervault/files/${id}?${v ? `v=${v}&` : ""}${download ? "download=1" : ""}`;

function PreviewDialog({ doc, version, onClose }: { doc: DocumentRow; version: number; onClose: () => void }) {
  const v = doc.versions.find((x) => x.version === version) ?? doc.versions[0];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-[900px] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{doc.name} · v{v.version}</DialogTitle>
          <DialogDescription>{v.filename} · {fmtSize(v.size)}</DialogDescription>
        </DialogHeader>
        <div className="px-4 pb-4">
          {v.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(doc.id, v.version)} alt={doc.name} className="mx-auto max-h-[70vh] rounded-lg object-contain" />
          ) : (
            <iframe src={fileUrl(doc.id, v.version)} title={doc.name} className="h-[70vh] w-full rounded-lg border" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VersionsDialog({ doc, ui, onClose, onPreview }: { doc: DocumentRow; ui: VaultUi; onClose: () => void; onPreview: (v: number) => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>{doc.name}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 px-4 pb-4">
          {doc.versions.map((v) => (
            <li key={v.version} className="rounded-xl border border-border/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  v{v.version} {v.version === doc.currentVersion && <Badge className="ml-1 bg-primary/10 text-primary">Current</Badge>}
                </p>
                {ui.download && (
                  <div className="flex gap-1">
                    {(v.kind === "image" || v.kind === "pdf") && (
                      <Button type="button" variant="ghost" size="xs" onClick={() => onPreview(v.version)}>
                        <Eye className="size-3.5" data-icon="inline-start" />
                        Preview
                      </Button>
                    )}
                    <a href={fileUrl(doc.id, v.version, true)} className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium hover:bg-muted">
                      <Download className="size-3.5" />
                      Download
                    </a>
                  </div>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">{v.filename} · {fmtSize(v.size)}</p>
              <p className="text-[11px] text-muted-foreground">{v.uploadedByName ?? "Unknown"} · {formatDateTime(v.uploadedAt)}</p>
              {v.note && <p className="mt-1 text-xs">{v.note}</p>}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentsTable({ rows, ui, locked }: CommonProps & { rows: DocumentRow[] }) {
  const [preview, setPreview] = useState<{ id: string; version: number } | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const previewDoc = rows.find((r) => r.id === preview?.id);
  const historyDoc = rows.find((r) => r.id === history);
  return (
    <>
      <TableShell isEmpty={rows.length === 0} empty={{ icon: <FileText className="size-5" />, title: "No documents found", hint: "Uploaded agreements, KYC, certificates and other files appear here." }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              {!locked && <TableHead>Belongs to</TableHead>}
              <TableHead>Category</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const cur = r.versions.find((v) => v.version === r.currentVersion) ?? r.versions[0];
              const previewable = cur.kind === "image" || cur.kind === "pdf";
              const writable = canWriteRow(ui, r.scope, r.clientId);
              return (
                <TableRow key={r.id} className={r.status === "archived" ? "opacity-60" : undefined}>
                  <TableCell>
                    <NameCell row={r} category={`${cur.filename} · ${fmtSize(cur.size)}`} icon={<FileText className="size-4" />} />
                    {r.description && <p className="mt-0.5 line-clamp-1 max-w-64 pl-6 text-[11px] text-muted-foreground">{r.description}</p>}
                  </TableCell>
                  {!locked && (
                    <TableCell>
                      <OwnerBadge scope={r.scope} clientId={r.clientId} clientName={r.clientName} />
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant="outline">{labelOf(DOCUMENT_CATEGORIES, r.category)}</Badge>
                  </TableCell>
                  <TableCell>
                    <button type="button" onClick={() => setHistory(r.id)} className="inline-flex items-center gap-1 text-sm hover:text-primary" aria-label={`Version history of ${r.name}`}>
                      v{r.currentVersion}
                      {r.versions.length > 1 && <History className="size-3 text-muted-foreground" />}
                    </button>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs">{cur.uploadedByName ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDate(cur.uploadedAt)}</p>
                  </TableCell>
                  <TableCell>
                    <ExpiryBadge state={r.expiry} date={r.expiryDate} />
                  </TableCell>
                  <TableCell>
                    <RowActions
                      type="document"
                      row={r}
                      ui={{ ...ui, edit: ui.edit && ui.manageDocs, del: ui.del }}
                      extra={
                        <>
                          {ui.download && previewable && (
                            <Button type="button" variant="ghost" size="icon-xs" aria-label="Preview" onClick={() => setPreview({ id: r.id, version: r.currentVersion })}>
                              <Eye className="size-3.5" />
                            </Button>
                          )}
                          {ui.download && (
                            <a href={fileUrl(r.id, r.currentVersion, true)} aria-label="Download" className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted">
                              <Download className="size-3.5" />
                            </a>
                          )}
                          {writable && ui.manageDocs && (
                            <ReplaceDocumentDialog doc={r} trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label="Upload a new version"><Upload className="size-3.5" /></Button>} />
                          )}
                        </>
                      }
                      edit={<DocumentDialog ui={ui} locked={locked} initial={r} trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label="Edit details"><Pencil className="size-3.5" /></Button>} />}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableShell>
      {previewDoc && preview && <PreviewDialog doc={previewDoc} version={preview.version} onClose={() => setPreview(null)} />}
      {historyDoc && <VersionsDialog doc={historyDoc} ui={ui} onClose={() => setHistory(null)} onPreview={(v) => { setPreview({ id: historyDoc.id, version: v }); setHistory(null); }} />}
    </>
  );
}

// ── URLs & accounts ───────────────────────────────────────────────────────

export function LinksTable({ rows, ui, locked, credentials }: CommonProps & { rows: LinkRow[]; credentials: { id: string; name: string; scope: "company" | "client"; clientId: string | null }[] }) {
  return (
    <TableShell isEmpty={rows.length === 0} empty={{ icon: <Link2 className="size-5" />, title: "No URLs or accounts found", hint: "Websites, admin products, hosting, Git, cloud and other important links appear here." }}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            {!locked && <TableHead>Belongs to</TableHead>}
            <TableHead>URL</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Credential</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className={r.status === "archived" ? "opacity-60" : undefined}>
              <TableCell>
                <NameCell row={r} category={labelOf(LINK_TYPES, r.category)} icon={<Link2 className="size-4" />} />
                {r.notes && <p className="mt-0.5 line-clamp-1 max-w-64 pl-6 text-[11px] text-muted-foreground">{r.notes}</p>}
              </TableCell>
              {!locked && (
                <TableCell>
                  <OwnerBadge scope={r.scope} clientId={r.clientId} clientName={r.clientName} />
                </TableCell>
              )}
              <TableCell>
                {r.url ? (
                  <a href={r.url} {...EXTERNAL} className="inline-flex max-w-52 items-center gap-1 truncate text-sm text-primary hover:underline">
                    <span className="truncate">{r.url.replace(/^https?:\/\//, "")}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="max-w-40 truncate text-sm">{r.account ?? <span className="text-xs text-muted-foreground">—</span>}</TableCell>
              <TableCell className="text-sm">{r.credentialName ?? <span className="text-xs text-muted-foreground">—</span>}</TableCell>
              <TableCell>
                <ExpiryBadge state={r.expiry} date={r.expiryDate} />
              </TableCell>
              <TableCell>
                <RowActions
                  type="link"
                  row={r}
                  ui={ui}
                  edit={<LinkDialog ui={ui} locked={locked} initial={r} credentials={credentials} trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label="Edit"><Pencil className="size-3.5" /></Button>} />}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableShell>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────

export function NotesList({ rows, ui, locked }: CommonProps & { rows: NoteRow[] }) {
  if (rows.length === 0) return <EmptyState icon={<StickyNote className="size-5" />} title="No notes found">Access instructions, setup and deployment notes appear here.</EmptyState>;
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {rows.map((r) => (
        <li key={r.id} className={`rounded-2xl border border-border/50 bg-background/60 p-4 ${r.status === "archived" ? "opacity-60" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{labelOf(NOTE_TYPES, r.category)}</Badge>
                {!locked && <OwnerBadge scope={r.scope} clientId={r.clientId} clientName={r.clientName} />}
                {r.status === "archived" && <StatusBadge status="archived" />}
              </div>
            </div>
            <RowActions type="note" row={r} ui={ui} edit={<NoteDialog ui={ui} locked={locked} initial={r} trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label="Edit"><Pencil className="size-3.5" /></Button>} />} />
          </div>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{r.body}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {r.updatedByName ?? r.createdByName ?? "—"} · {formatDateTime(r.updatedAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}
