"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import {
  CATEGORY_OPTIONS,
  DOCUMENT_CATEGORIES,
  LIMITS,
  STATUSES,
  STATUS_LABEL,
  type RecordType,
} from "@/lib/products/cybervault/constants";
import { ACCEPT_ATTR } from "@/lib/products/cybervault/file-types";
import type { CredentialRow, DocumentRow, LinkRow, NoteRow } from "@/lib/products/cybervault/records";
import { saveCredentialAction, saveDocumentAction, saveLinkAction, saveNoteAction } from "@/app/(products)/cybervault/(protected)/actions";
import type { LockedOwner, VaultUi } from "@/components/products/cybervault/vault-types";
import { useBrand } from "@/components/platform/BrandProvider";

type Result = { ok: boolean; error?: string };

/** Uploads go through `/api/cybervault/documents` (server actions cap bodies at 1 MB). */
async function uploadDocument(fd: FormData): Promise<Result> {
  try {
    const res = await fetch("/api/cybervault/documents", { method: "POST", body: fd });
    return (await res.json()) as Result;
  } catch {
    return { ok: false, error: "The upload failed — check your connection and try again." };
  }
}

/** Shared dialog chrome: opens from a trigger, runs `onSubmit`, toasts, closes and refreshes. */
function FormDialog({
  trigger,
  title,
  description,
  submitLabel = "Save",
  onOpen,
  onSubmit,
  children,
  wide,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  submitLabel?: string;
  onOpen?: () => void;
  onSubmit: () => Promise<Result>;
  children: ReactNode;
  wide?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await onSubmit();
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      toast.success("Saved");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setError(null);
          onOpen?.();
        }
      }}
    >
      <DialogTrigger render={<span className="contents" />}>{trigger}</DialogTrigger>
      <DialogContent className={wide ? "max-h-[90vh] max-w-[720px] overflow-y-auto" : "max-h-[90vh] overflow-y-auto"}>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-3 px-4 pb-2 sm:grid-cols-2">
            {children}
            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, hint, full, children }: { label: string; htmlFor?: string; hint?: string; full?: boolean; children: ReactNode }) {
  return (
    <div className={full ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface Owner {
  scope: "company" | "client";
  clientId: string;
}

function initialOwner(ui: VaultUi, locked: LockedOwner | undefined, row?: { scope: "company" | "client"; clientId: string | null }): Owner {
  if (row) return { scope: row.scope, clientId: row.clientId ?? "" };
  if (locked) return { scope: locked.scope, clientId: locked.clientId ?? "" };
  if (ui.writeCompany) return { scope: "company", clientId: "" };
  return { scope: "client", clientId: ui.clients[0]?.value ?? "" };
}

/** Company / client picker. Hidden when the page already fixes the owner (a client or the company profile). */
function OwnerFields({ ui, owner, setOwner, locked }: { ui: VaultUi; owner: Owner; setOwner: (o: Owner) => void; locked?: LockedOwner }) {
  const brand = useBrand();
  if (locked) return null;
  const scopes = [
    ...(ui.writeCompany ? [{ value: "company", label: `Company (${brand.name})` }] : []),
    ...(ui.clients.length > 0 ? [{ value: "client", label: "Client" }] : []),
  ];
  return (
    <>
      <Field label="Belongs to" htmlFor="f-scope">
        <OptionSelect id="f-scope" value={owner.scope} options={scopes} onChange={(v) => setOwner({ scope: v === "client" ? "client" : "company", clientId: v === "client" ? owner.clientId || ui.clients[0]?.value || "" : "" })} />
      </Field>
      {owner.scope === "client" ? (
        <Field label="Client" htmlFor="f-client">
          <OptionSelect id="f-client" value={owner.clientId} options={ui.clients} placeholder="Choose a client" onChange={(v) => setOwner({ scope: "client", clientId: v })} />
        </Field>
      ) : (
        <div className="hidden sm:block" />
      )}
    </>
  );
}

function StatusField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Status" htmlFor="f-status">
      <OptionSelect id="f-status" value={value} onChange={onChange} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
    </Field>
  );
}

const bind = <T extends Record<string, string>>(v: T, set: (fn: (p: T) => T) => void) => (k: keyof T) => ({
  value: v[k],
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set((p) => ({ ...p, [k]: e.target.value })),
});

function randomPassword(len = 20): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// ── Credential ────────────────────────────────────────────────────────────

export function CredentialDialog({ ui, locked, initial, trigger }: { ui: VaultUi; locked?: LockedOwner; initial?: CredentialRow; trigger: ReactNode }) {
  const fresh = () => ({ name: initial?.name ?? "", category: initial?.category ?? "admin", username: initial?.username ?? "", loginUrl: initial?.loginUrl ?? "", password: "", expiryDate: initial?.expiryDate ?? "", notes: initial?.notes ?? "", status: initial?.status ?? "active" });
  const [v, setV] = useState(fresh);
  const [owner, setOwner] = useState<Owner>(() => initialOwner(ui, locked, initial));
  const [showPw, setShowPw] = useState(false);
  const [clearPw, setClearPw] = useState(false);
  const f = bind(v, setV);
  return (
    <FormDialog
      trigger={trigger}
      wide
      title={initial ? "Edit credential" : "Add credential"}
      description="The password is encrypted before it is stored and stays masked until someone with permission reveals it."
      onOpen={() => {
        setV(fresh());
        setOwner(initialOwner(ui, locked, initial));
        setShowPw(false);
        setClearPw(false);
      }}
      onSubmit={() => saveCredentialAction(initial?.id ?? null, { ...v, ...owner, clearPassword: clearPw })}
    >
      <OwnerFields ui={ui} owner={owner} setOwner={setOwner} locked={locked} />
      <Field label="Service / account name" htmlFor="f-name">
        <Input id="f-name" required maxLength={LIMITS.name} placeholder="e.g. GoDaddy — main account" {...f("name")} />
      </Field>
      <Field label="Account type" htmlFor="f-cat">
        <OptionSelect id="f-cat" value={v.category} options={CATEGORY_OPTIONS.credential} onChange={(x) => setV((p) => ({ ...p, category: x }))} />
      </Field>
      <Field label="Username / email" htmlFor="f-user">
        <Input id="f-user" autoComplete="off" maxLength={200} {...f("username")} />
      </Field>
      <Field label="Login URL" htmlFor="f-url">
        <Input id="f-url" inputMode="url" placeholder="https://" maxLength={500} {...f("loginUrl")} />
      </Field>
      <Field
        label="Password / secret"
        htmlFor="f-pw"
        hint={
          !ui.encryptionReady
            ? "Encryption key is not configured — a password cannot be saved yet."
            : initial?.hasPassword
              ? "A password is stored. Leave blank to keep it, or type a new one to replace it."
              : undefined
        }
      >
        <div className="flex gap-1.5">
          <Input id="f-pw" type={showPw ? "text" : "password"} autoComplete="new-password" spellCheck={false} maxLength={LIMITS.secret} disabled={!ui.encryptionReady || clearPw} {...f("password")} />
          <Button type="button" variant="outline" size="icon" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((s) => !s)}>
            {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <Button type="button" variant="outline" size="icon" aria-label="Generate a strong password" onClick={() => { setV((p) => ({ ...p, password: randomPassword() })); setShowPw(true); }} disabled={!ui.encryptionReady}>
            <Wand2 className="size-4" />
          </Button>
        </div>
        {initial?.hasPassword && (
          <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
            <input type="checkbox" className="size-3.5 accent-[var(--primary)]" checked={clearPw} onChange={(e) => setClearPw(e.target.checked)} />
            Remove the stored password
          </label>
        )}
      </Field>
      <Field label="Expiry date" htmlFor="f-exp" hint="Renewal, rotation or licence end date — drives Expiry & Alerts.">
        <Input id="f-exp" type="date" {...f("expiryDate")} />
      </Field>
      {initial && <StatusField value={v.status} onChange={(x) => setV((p) => ({ ...p, status: x as "active" | "archived" }))} />}
      <Field label="Notes" htmlFor="f-notes" full>
        <Textarea id="f-notes" rows={3} maxLength={LIMITS.text} {...f("notes")} />
      </Field>
    </FormDialog>
  );
}

// ── URL / account ─────────────────────────────────────────────────────────

export function LinkDialog({
  ui,
  locked,
  initial,
  credentials,
  trigger,
}: {
  ui: VaultUi;
  locked?: LockedOwner;
  initial?: LinkRow;
  credentials: { id: string; name: string; scope: "company" | "client"; clientId: string | null }[];
  trigger: ReactNode;
}) {
  const fresh = () => ({ name: initial?.name ?? "", category: initial?.category ?? "website", url: initial?.url ?? "", account: initial?.account ?? "", credentialId: initial?.credentialId ?? "", expiryDate: initial?.expiryDate ?? "", notes: initial?.notes ?? "", status: initial?.status ?? "active" });
  const [v, setV] = useState(fresh);
  const [owner, setOwner] = useState<Owner>(() => initialOwner(ui, locked, initial));
  const f = bind(v, setV);
  // Only credentials of the same owner can be linked — the server enforces it too.
  const options = credentials.filter((c) => c.scope === owner.scope && (owner.scope === "company" || c.clientId === owner.clientId)).map((c) => ({ value: c.id, label: c.name }));
  return (
    <FormDialog
      trigger={trigger}
      wide
      title={initial ? "Edit URL / account" : "Add URL / account"}
      onOpen={() => {
        setV(fresh());
        setOwner(initialOwner(ui, locked, initial));
      }}
      onSubmit={() => saveLinkAction(initial?.id ?? null, { ...v, ...owner })}
    >
      <OwnerFields ui={ui} owner={owner} setOwner={(o) => { setOwner(o); setV((p) => ({ ...p, credentialId: "" })); }} locked={locked} />
      <Field label="Name" htmlFor="f-name">
        <Input id="f-name" required maxLength={LIMITS.name} placeholder="e.g. Production site" {...f("name")} />
      </Field>
      <Field label="Type" htmlFor="f-cat">
        <OptionSelect id="f-cat" value={v.category} options={CATEGORY_OPTIONS.link} onChange={(x) => setV((p) => ({ ...p, category: x }))} />
      </Field>
      <Field label="URL" htmlFor="f-url">
        <Input id="f-url" inputMode="url" placeholder="https://" maxLength={500} {...f("url")} />
      </Field>
      <Field label="Account" htmlFor="f-acct" hint="Account id / owner name on that service.">
        <Input id="f-acct" maxLength={200} {...f("account")} />
      </Field>
      <Field label="Related credential" htmlFor="f-cred" hint="Links to a credential in the same vault — the password itself is never shown here.">
        <OptionSelect id="f-cred" value={v.credentialId} options={options} noneLabel="None" onChange={(x) => setV((p) => ({ ...p, credentialId: x }))} />
      </Field>
      <Field label="Expiry / renewal date" htmlFor="f-exp" hint="Domains, hosting, SSL…">
        <Input id="f-exp" type="date" {...f("expiryDate")} />
      </Field>
      {initial && <StatusField value={v.status} onChange={(x) => setV((p) => ({ ...p, status: x as "active" | "archived" }))} />}
      <Field label="Notes" htmlFor="f-notes" full>
        <Textarea id="f-notes" rows={3} maxLength={LIMITS.text} {...f("notes")} />
      </Field>
    </FormDialog>
  );
}

// ── Note ──────────────────────────────────────────────────────────────────

export function NoteDialog({ ui, locked, initial, trigger }: { ui: VaultUi; locked?: LockedOwner; initial?: NoteRow; trigger: ReactNode }) {
  const fresh = () => ({ name: initial?.name ?? "", category: initial?.category ?? "general", body: initial?.body ?? "", status: initial?.status ?? "active" });
  const [v, setV] = useState(fresh);
  const [owner, setOwner] = useState<Owner>(() => initialOwner(ui, locked, initial));
  const f = bind(v, setV);
  return (
    <FormDialog
      trigger={trigger}
      wide
      title={initial ? "Edit note" : "Add note"}
      description="Do not paste passwords into notes — store them as a credential so they are encrypted and access-logged."
      onOpen={() => {
        setV(fresh());
        setOwner(initialOwner(ui, locked, initial));
      }}
      onSubmit={() => saveNoteAction(initial?.id ?? null, { ...v, ...owner })}
    >
      <OwnerFields ui={ui} owner={owner} setOwner={setOwner} locked={locked} />
      <Field label="Title" htmlFor="f-name">
        <Input id="f-name" required maxLength={LIMITS.name} {...f("name")} />
      </Field>
      <Field label="Type" htmlFor="f-cat">
        <OptionSelect id="f-cat" value={v.category} options={CATEGORY_OPTIONS.note} onChange={(x) => setV((p) => ({ ...p, category: x }))} />
      </Field>
      {initial && <StatusField value={v.status} onChange={(x) => setV((p) => ({ ...p, status: x as "active" | "archived" }))} />}
      <Field label="Note" htmlFor="f-body" full>
        <Textarea id="f-body" required rows={8} maxLength={LIMITS.note} {...f("body")} />
      </Field>
    </FormDialog>
  );
}

// ── Document ──────────────────────────────────────────────────────────────

export function DocumentDialog({ ui, locked, initial, trigger }: { ui: VaultUi; locked?: LockedOwner; initial?: DocumentRow; trigger: ReactNode }) {
  const fresh = () => ({ name: initial?.name ?? "", category: initial?.category ?? (locked?.scope === "client" ? "client_documents" : "company_documents"), description: initial?.description ?? "", expiryDate: initial?.expiryDate ?? "", notes: initial?.notes ?? "", status: initial?.status ?? "active" });
  const [v, setV] = useState(fresh);
  const [owner, setOwner] = useState<Owner>(() => initialOwner(ui, locked, initial));
  const [file, setFile] = useState<File | null>(null);
  const f = bind(v, setV);
  return (
    <FormDialog
      trigger={trigger}
      wide
      title={initial ? "Edit document details" : "Upload document"}
      description={initial ? "To change the file itself, use “New version” on the document." : `PDF, images, Office files, CSV/TXT or ZIP up to ${Math.round(LIMITS.fileBytes / 1024 / 1024)} MB. Stored privately; only reachable through this product.`}
      onOpen={() => {
        setV(fresh());
        setOwner(initialOwner(ui, locked, initial));
        setFile(null);
      }}
      onSubmit={() => {
        if (!initial && !file) return Promise.resolve({ ok: false, error: "Choose a file to upload." });
        const fd = new FormData();
        for (const [k, val] of Object.entries({ ...v, ...owner })) fd.set(k, val);
        if (initial) return saveDocumentAction(initial.id, fd);
        if (file) fd.set("file", file);
        return uploadDocument(fd);
      }}
    >
      <OwnerFields ui={ui} owner={owner} setOwner={setOwner} locked={locked} />
      <Field label="Document name" htmlFor="f-name">
        <Input id="f-name" required maxLength={LIMITS.name} {...f("name")} />
      </Field>
      <Field label="Category" htmlFor="f-cat">
        <OptionSelect id="f-cat" value={v.category} options={DOCUMENT_CATEGORIES} onChange={(x) => setV((p) => ({ ...p, category: x }))} />
      </Field>
      {!initial && (
        <Field label="File" htmlFor="f-file" full>
          <Input id="f-file" type="file" required accept={ACCEPT_ATTR} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      )}
      <Field label="Expiry date" htmlFor="f-exp" hint="Certificates, licences, agreements…">
        <Input id="f-exp" type="date" {...f("expiryDate")} />
      </Field>
      {initial && <StatusField value={v.status} onChange={(x) => setV((p) => ({ ...p, status: x as "active" | "archived" }))} />}
      <Field label="Description" htmlFor="f-desc" full>
        <Textarea id="f-desc" rows={2} maxLength={LIMITS.text} {...f("description")} />
      </Field>
      <Field label="Notes" htmlFor="f-notes" full>
        <Textarea id="f-notes" rows={2} maxLength={LIMITS.text} {...f("notes")} />
      </Field>
    </FormDialog>
  );
}

export function ReplaceDocumentDialog({ doc, trigger }: { doc: DocumentRow; trigger: ReactNode }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  return (
    <FormDialog
      trigger={trigger}
      title={`New version of “${doc.name}”`}
      description={`Currently v${doc.currentVersion}. Earlier versions stay available in the version history.`}
      submitLabel="Upload version"
      onOpen={() => {
        setFile(null);
        setNote("");
      }}
      onSubmit={() => {
        if (!file) return Promise.resolve({ ok: false, error: "Choose the new file." });
        const fd = new FormData();
        fd.set("file", file);
        fd.set("note", note);
        fd.set("docId", doc.id);
        return uploadDocument(fd);
      }}
    >
      <Field label="File" htmlFor="f-file" full>
        <Input id="f-file" type="file" required accept={ACCEPT_ATTR} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <Field label="What changed? (optional)" htmlFor="f-note" full>
        <Input id="f-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

export type { RecordType };
