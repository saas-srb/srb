"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDescription, FormFooter, FormHeader, FormShell, FormTitle } from "@/components/products/playbook-ai/forms/FormShell";
import { saveNamedVersionAction } from "@/app/(products)/playbook-ai/(protected)/documents/[id]/actions";

/** "Save as version": a named version of the saved draft that can be compared and restored (it used to be a popup in the editor). */
export default function SaveVersionForm({ id, title, backHref }: { id: string; title: string; backHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <FormShell>
      <FormHeader>
        <FormTitle>Save as version</FormTitle>
        <FormDescription>{title}. Saves the document as it is now as a named version you can compare and go back to.</FormDescription>
      </FormHeader>
      <label className="block text-sm">Name or note (optional)
        <input className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" autoComplete="off" maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <FormFooter>
        <Button type="button" variant="ghost" onClick={() => router.push(backHref)}>Cancel</Button>
        <Button type="button" disabled={pending} onClick={() => start(async () => {
          const r = await saveNamedVersionAction({ id, label: label.trim() });
          if (!r.ok) { setError(r.message); return; }
          toast.success("Version saved");
          router.push(backHref);
        })}>{pending ? "Saving…" : "Save version"}</Button>
      </FormFooter>
    </FormShell>
  );
}
