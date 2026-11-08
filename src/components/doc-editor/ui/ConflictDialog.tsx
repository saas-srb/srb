"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  /** Plain text of the user's own version, for copying. */
  localText: () => string;
  onReload: () => Promise<void>;
}

/**
 * Shown when the server says someone else saved first. There is no "keep mine" button on purpose: the editor never overwrites.
 * The user either copies their text and reloads, or just reloads.
 */
export default function ConflictDialog({ open, localText, onReload }: Props) {
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(localText()); setCopied("ok"); } catch { setCopied("failed"); }
  };
  const reload = async () => {
    setBusy(true); setErr(null);
    try { await onReload(); setCopied("idle"); } catch (e) { setErr(e instanceof Error && e.message ? e.message : "The latest version could not be loaded. Try again."); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={() => { /* cannot be dismissed: the user must choose */ }}>
      <DialogContent showCloseButton={false} role="alertdialog" aria-describedby="pb-conflict-desc">
        <DialogHeader>
          <DialogTitle>Someone else changed this document</DialogTitle>
          <DialogDescription id="pb-conflict-desc">Reload to see their changes, or copy your changes first. Your edits have not been saved and nothing of theirs was overwritten.</DialogDescription>
        </DialogHeader>
        {(copied !== "idle" || err) && (
          <p role="status" className={`px-4 text-sm ${copied === "failed" || err ? "text-destructive" : "text-muted-foreground"}`}>
            {err ?? (copied === "ok" ? "Your changes were copied. Paste them after reloading." : "Copying was blocked by the browser. Select the text in the page and copy it before reloading.")}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={copy}>Copy my changes</Button>
          <Button type="button" onClick={reload} disabled={busy}>{busy ? "Loading…" : "Reload latest version"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
