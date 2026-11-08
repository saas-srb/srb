"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ID_ACCEPT, ID_MAX_BYTES, MESSAGE_MAX, MESSAGE_MIN, fileError, requestInputError } from "@/lib/platform/reactivation-rule";

type Done = { reference: string } | null;

/** The "Request reactivation" button and its form. Company name is shown but locked: the request is always for the company this address belongs to. */
export default function ReactivationDialog({ companyName, again }: { companyName: string; again: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    const bad = fileError({ size: f.size, type: f.type });
    if (bad) {
      setError(bad);
      if (input.current) input.current.value = "";
      return setFile(null);
    }
    setFile(f);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const bad = requestInputError({ name, email, message, consent }) ?? (file ? null : "Upload a government ID (PDF, JPG, PNG or WebP).");
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("name", name.trim());
      body.set("email", email.trim());
      body.set("message", message.trim());
      body.set("consent", "true");
      body.set("idFile", file!);
      const res = await fetch("/api/reactivation", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; reference?: string; error?: string } | null;
      if (res.ok && data?.ok && data.reference) setDone({ reference: data.reference });
      else setError(data?.error ?? "We couldn't send your request. Please try again.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const close = (o: boolean) => {
    if (busy) return;
    setOpen(o);
    // A sent request ends here: the page below then shows it as "under review".
    if (!o && done) window.location.reload();
  };

  return (
    <>
      <Button type="button" size="lg" className="mt-6 h-11 w-full" onClick={() => setOpen(true)}>
        <Send className="size-4" data-icon="inline-start" /> {again ? "Send a new request" : "Request reactivation"}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[92vh] overflow-y-auto p-6 sm:max-w-lg">
          {done ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                <CheckCircle2 className="size-8" />
              </div>
              <DialogTitle className="text-xl font-black">Request sent</DialogTitle>
              <DialogDescription className="mt-2">
                Reference <b>{done.reference}</b>. We sent a confirmation to {email.trim()}, and will email you the decision.
              </DialogDescription>
              <Button type="button" className="mt-6" onClick={() => close(false)}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <DialogHeader>
                <DialogTitle>Request reactivation</DialogTitle>
                <DialogDescription>Tell us who you are and why access should be restored. Requests are reviewed by our team.</DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="ra-company">Company name</Label>
                <Input id="ra-company" value={companyName} disabled readOnly />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ra-name">Your full name</Label>
                  <Input id="ra-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ra-email">Work email</Label>
                  <Input id="ra-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ra-message">Description</Label>
                <Textarea id="ra-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={MESSAGE_MAX} placeholder="Why should this workspace be reactivated? What has changed since it was suspended?" required />
                <p className="text-right text-xs text-muted-foreground">
                  {message.trim().length}/{MESSAGE_MAX} · at least {MESSAGE_MIN}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ra-id">Government ID</Label>
                <label htmlFor="ra-id" className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm transition-colors hover:bg-muted/60">
                  {file ? <FileText className="size-5 shrink-0 text-primary" /> : <Upload className="size-5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : "Choose a file (PDF, JPG, PNG or WebP)"}</span>
                  <span className="shrink-0 text-xs font-semibold text-primary">{file ? "Change" : "Browse"}</span>
                </label>
                <input ref={input} id="ra-id" type="file" accept={ID_ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                <p className="text-xs text-muted-foreground">Passport, driving licence, Aadhaar or similar, up to {ID_MAX_BYTES / 1024 / 1024} MB. Stored encrypted and seen only by our review team.</p>
              </div>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 accent-[var(--primary)]" />
                <span>I am authorised to act for {companyName}, and the ID above is mine.</span>
              </label>

              <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
                {error}
              </p>
              <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Send className="size-4" data-icon="inline-start" />}
                {busy ? "Sending…" : "Submit request"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
