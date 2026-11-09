"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SEND_STATE_LABEL, type SendState } from "@/lib/products/playbook-ai/items-types";
import { cn } from "@/lib/utils";

export const FIELD = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

const STATE_TONE: Record<SendState, string> = {
  clone_draft: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  ready: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  sent: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  viewed: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  partially_signed: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  signed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  declined: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  expired: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  voided: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function SendChip({ state }: { state: SendState | null }) {
  if (!state) return <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Draft</span>;
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", STATE_TONE[state])}>{SEND_STATE_LABEL[state]}</span>;
}

export const fmtDate = (iso: string): string => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });

export function base64ToUrl(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

/** A modal with the real PDF in it. `load` returns the base64 PDF or an error message; `footer` adds buttons (downloads). The browser's own PDF viewer gives page navigation and zoom. */
export function PdfPreviewDialog({ open, onClose, title, load, footer, note }: { open: boolean; onClose: () => void; title: string; load: () => Promise<{ ok: true; pdfBase64: string } | { ok: false; message: string }>; footer?: ReactNode; note?: string }) {
  const [state, setState] = useState<{ url: string | null; error: string | null; loading: boolean }>({ url: null, error: null, loading: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    let url: string | null = null;
    let cancelled = false;
    setState({ url: null, error: null, loading: true });
    void load().then((r) => {
      if (cancelled) return;
      if (r.ok) { url = base64ToUrl(r.pdfBase64); setState({ url, error: null, loading: false }); }
      else setState({ url: null, error: r.message, loading: false });
    }).catch(() => { if (!cancelled) setState({ url: null, error: "The preview could not be made. Try again.", loading: false }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    // `load` is a fresh closure per render; the dialog loads once per opening (or per retry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attempt]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[92vh] max-w-[min(1000px,96vw)] flex-col gap-3 sm:max-w-[min(1000px,96vw)]">
        <DialogHeader>
          <DialogTitle>PDF preview</DialogTitle>
          <DialogDescription>{title}{note ? ` · ${note}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/30">
          {state.loading && (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6" role="status" aria-label="Making the PDF">
              <div className="h-[60%] w-[min(420px,80%)] animate-pulse rounded-md bg-muted" />
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Making the PDF…</p>
            </div>
          )}
          {state.error && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive" role="alert">{state.error}</p>
              <button type="button" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
            </div>
          )}
          {state.url && <iframe title="PDF preview" src={state.url} className="size-full" />}
        </div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
