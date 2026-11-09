"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cloneStarterAction } from "@/app/(products)/playbook-ai/(protected)/my-templates/actions";

/** Use template (start a document), Make my copy (the company's own editable copy), or Open my copy. */
export default function StarterActions({ typeId, hasContent, canCreate, canManage, ownId, ownStatus, ownVersion }: {
  typeId: string; hasContent: boolean; canCreate: boolean; canManage: boolean; ownId: string | null; ownStatus: string | null; ownVersion: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const copy = () => start(async () => {
    setError(null);
    const r = await cloneStarterAction(typeId);
    if (!r.ok) { setError(r.error.message); return; }
    toast.success("Your copy is ready to edit");
    router.push(`/playbook-ai/my-templates/${r.id}`);
  });
  return (
    <>
      {hasContent && canCreate && (
        <Button onClick={() => router.push(`/playbook-ai/documents/new?type=${encodeURIComponent(typeId)}`)}>
          Use template{ownId && ownStatus === "published" ? ` (your version ${ownVersion})` : ""}
        </Button>
      )}
      {hasContent && canManage && !ownId && (
        <Button variant="outline" onClick={copy} disabled={pending}>{pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}Make my copy</Button>
      )}
      {ownId && <Link href={`/playbook-ai/my-templates/${ownId}`} className="text-sm underline-offset-2 hover:underline">Open my copy{ownStatus && ownStatus !== "published" ? ` (${ownStatus})` : ""}</Link>}
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    </>
  );
}
