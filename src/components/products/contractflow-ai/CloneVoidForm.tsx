"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDescription, FormFooter, FormHeader, FormShell, FormTitle } from "@/components/products/playbook-ai/forms/FormShell";
import { voidCloneFromListAction } from "@/app/(products)/contractflow-ai/(protected)/clones/list-actions";
import { FIELD } from "@/components/products/playbook-ai/items/shared";

/** Void a document: needs a reason; signing links stop working and the record is kept (it used to be a popup in the list). */
export default function CloneVoidForm({ id, title, backHref }: { id: string; title: string; backHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <FormShell>
      <FormHeader>
        <FormTitle>Void this document?</FormTitle>
        <FormDescription>{title}. Signing links stop working. The record is kept, and you can create a replacement.</FormDescription>
      </FormHeader>
      <label className="block text-sm">Reason<input className={FIELD} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></label>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <FormFooter>
        <Button type="button" variant="ghost" onClick={() => router.push(backHref)}>Cancel</Button>
        <Button type="button" variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => start(async () => {
          const r = await voidCloneFromListAction(id, reason);
          if (!r.ok) { setError(r.message); return; }
          toast.success("Voided");
          router.push(backHref);
          router.refresh();
        })}>{pending ? "Voiding…" : "Void"}</Button>
      </FormFooter>
    </FormShell>
  );
}
