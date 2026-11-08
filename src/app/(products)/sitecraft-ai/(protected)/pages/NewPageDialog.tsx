"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelContent, PanelBody, PanelHeader, PanelTitle, PanelDescription, PanelFooter, PanelTrigger } from "@/components/products/sitecraft-ai/ui/SidePanel";
import { toast } from "sonner";
import { createPageAction } from "./actions";

export default function NewPageDialog() {
  const router = useRouter();
  const params = useSearchParams();
  // `?new=1` (e.g. from the website's CMS toolbar "New" menu) opens the product straight away.
  const [open, setOpen] = useState(() => params.get("new") === "1");
  const [path, setPath] = useState("");
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await createPageAction({ path, title, templateKey: "generic" });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      setPath("");
      setTitle("");
      router.push(`/sitecraft-ai/pages/${res.id}`);
      router.refresh();
    });
  };

  return (
    <Panel open={open} onOpenChange={setOpen}>
      <PanelTrigger render={<Button><Plus className="size-4" /> New page</Button>} />
      <PanelContent>
        <PanelHeader>
          <PanelTitle>New CMS page</PanelTitle>
          <PanelDescription>The path must match an existing route on the public site, e.g. /about.</PanelDescription>
        </PanelHeader>
        <PanelBody>
          <div className="space-y-1.5">
            <Label htmlFor="new-page-path">Path</Label>
            <Input id="new-page-path" placeholder="/about" value={path} onChange={(e) => setPath(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-page-title">Internal title</Label>
            <Input id="new-page-title" placeholder="About Us" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </PanelBody>
        <PanelFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !path.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Create"}
          </Button>
        </PanelFooter>
      </PanelContent>
    </Panel>
  );
}
