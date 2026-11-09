"use client";

import { useState } from "react";

/** Checks a PDF on the person's own device: its SHA-256 is computed in the browser (the file is never uploaded) and compared with the sealed one. */
export default function VerifyFile({ sha256 }: { sha256: string }) {
  const [result, setResult] = useState<"match" | "different" | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  async function check(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      setResult(hex === sha256 ? "match" : "different");
    } catch {
      setResult("error");
    }
    setBusy(false);
  }
  return (
    <div className="space-y-2 text-sm">
      <label className="block font-medium" htmlFor="verify-file">Check a copy you hold</label>
      <input id="verify-file" type="file" accept="application/pdf" disabled={busy} onChange={(e) => void check(e.target.files?.[0])} className="block w-full text-xs" />
      <p className="text-xs text-muted-foreground">The file is not uploaded; it is checked on your device.</p>
      {result === "match" && <p className="rounded-md bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300" role="status">This file is exactly the signed document.</p>}
      {result === "different" && <p className="rounded-md bg-destructive/10 p-2 text-destructive" role="alert">This file is not the signed document. It may have been changed, or it is a different file.</p>}
      {result === "error" && <p className="text-destructive" role="alert">The file could not be read.</p>}
    </div>
  );
}
