"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadReceiptDocumentAction } from "@/app/(products)/cashflow-ai/(protected)/receipts/actions";

export default function ReceiptDocuments({
  id,
  documents,
  canManage,
}: {
  id: string;
  documents: { storageKey: string; filename: string; size: number }[];
  canManage: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 text-sm">
      {documents.length === 0 ? (
        <p className="text-muted-foreground">No proof attached yet. Add the bank advice, deposit slip or a photo of the cheque.</p>
      ) : (
        <ul className="space-y-1">
          {documents.map((d) => (
            <li key={d.storageKey}>
              <a href={`/api/cashflow-ai/attachments/${d.storageKey}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
                <Paperclip className="size-3.5" />{d.filename}
              </a>
              <span className="ml-2 text-xs text-muted-foreground">{(d.size / 1024).toFixed(0)} KB</span>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              try {
                const r = await uploadReceiptDocumentAction(id, fd);
                if (r.ok) {
                  toast.success("Proof added");
                  if (input.current) input.current.value = "";
                } else toast.error(r.error);
              } catch {
                toast.error("Could not upload. Please try again.");
              }
            });
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input ref={input} type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" className="text-xs" />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Uploading…" : "Add proof"}</Button>
          <span className="text-xs text-muted-foreground">PDF, image or office file, up to 15 MB. Proof cannot be removed once added.</span>
        </form>
      )}
    </div>
  );
}
