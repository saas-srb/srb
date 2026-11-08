"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ConfirmDelete from "@/components/products/playbook-ai/ConfirmDelete";
import { deleteTemplateAction, duplicateTemplateAction, saveTemplateAction } from "@/app/(products)/playbook-ai/(protected)/actions";
import { DEFAULT_SECTIONS } from "@/lib/products/playbook-ai/constants";

export function NewTemplateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveTemplateAction({ name, description: "", departmentCodes: [], sections: DEFAULT_SECTIONS.map(({ key, title, guidance }) => ({ key, title, guidance })) });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.push(`/playbook-ai/templates/${res.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <Plus className="size-3.5" data-icon="inline-start" />
        New template
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={create}>
          <DialogHeader>
            <DialogTitle>New template</DialogTitle>
            <DialogDescription>Starts with the standard sections — customise them on the next screen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 px-4 pb-2">
            <Label htmlFor="nt-name">Name</Label>
            <Input id="nt-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
            {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DuplicateTemplateButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label="Duplicate template"
      title="Duplicate"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await duplicateTemplateAction(id);
          if (!res.ok) toast.error(res.error);
          else router.push(`/playbook-ai/templates/${res.id}`);
        })
      }
    >
      <Copy />
    </Button>
  );
}

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  return <ConfirmDelete label={`Delete ${name}`} what={`the "${name}" template`} action={() => deleteTemplateAction(id)} />;
}
