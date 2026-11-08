"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelContent, PanelBody, PanelHeader, PanelTitle, PanelDescription, PanelFooter, PanelTrigger } from "@/components/products/sitecraft-ai/ui/SidePanel";
import { createRecordAction } from "../actions";

export default function NewRecordDialog({ collection, singular }: { collection: string; singular: string }) {
  const router = useRouter();
  const params = useSearchParams();
  // `?new=1` (e.g. from the website's CMS toolbar "New" menu) opens the product straight away.
  const [open, setOpen] = useState(() => params.get("new") === "1");
  const [slug, setSlug] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await createRecordAction(collection, slug);
      if (!res.ok) { toast.error(res.error); return; }
      setOpen(false);
      setSlug("");
      router.push(`/sitecraft-ai/collections/${collection}/${res.slug}`);
    });
  };

  return (
    <Panel open={open} onOpenChange={setOpen}>
      <PanelTrigger render={<Button><Plus className="size-4" /> New {singular.toLowerCase()}</Button>} />
      <PanelContent>
        <PanelHeader>
          <PanelTitle>New {singular.toLowerCase()}</PanelTitle>
          <PanelDescription>Choose its URL slug — it can&apos;t be changed later. It starts as an unpublished draft.</PanelDescription>
        </PanelHeader>
        <PanelBody>
          <div className="space-y-1.5">
            <Label htmlFor="new-record-slug">Slug</Label>
            <Input id="new-record-slug" placeholder="e.g. senior-react-developer" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
        </PanelBody>
        <PanelFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !slug.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Create draft"}
          </Button>
        </PanelFooter>
      </PanelContent>
    </Panel>
  );
}
