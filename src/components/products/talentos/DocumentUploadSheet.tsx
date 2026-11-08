"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/lib/products/talentos/document-categories";

interface Props {
  /** Omit for the employee portal — the server infers the caller's id. */
  employeeId?: string;
  allowedCategories: readonly DocumentCategory[];
  /** When set, this upload replaces an existing document. */
  replace?: { id: string; title: string; category: string };
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
  triggerSize?: "sm" | "default";
}

export default function DocumentUploadSheet({
  employeeId,
  allowedCategories,
  replace,
  triggerLabel = "Upload Document",
  triggerVariant = "default",
  triggerSize = "sm",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    category: (replace?.category as string) ?? allowedCategories[0] ?? "other",
    title: replace?.title ?? "",
    issuedDate: "",
    expiryDate: "",
  });

  const cats = DOCUMENT_CATEGORIES.filter((c) => allowedCategories.includes(c.value));

  function submit() {
    setErrors({});
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErrors({ file: "Select a file." });
      return;
    }
    const fd = new FormData();
    if (employeeId) fd.set("employeeId", employeeId);
    if (replace) fd.set("replacesId", replace.id);
    fd.set("category", form.category);
    fd.set("title", form.title);
    fd.set("issuedDate", form.issuedDate);
    fd.set("expiryDate", form.expiryDate);
    fd.set("file", file);

    startTransition(async () => {
      const res = await fetch("/api/talentos/documents", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fields) setErrors(data.fields);
        toast.error(data.error ?? "Upload failed.");
        return;
      }
      toast.success(replace ? "New version uploaded" : "Document uploaded");
      setOpen(false);
      setForm({ category: allowedCategories[0] ?? "other", title: "", issuedDate: "", expiryDate: "" });
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <>
      <Button type="button" variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
        <Upload className="size-3.5" data-icon="inline-start" />
        {replace ? "Upload New Version" : triggerLabel}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{replace ? `Replace “${replace.title}”` : "Upload Document"}</SheetTitle>
            <SheetDescription>PDF, image or Word document, up to 10 MB.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                disabled={!!replace}
                onValueChange={(v) => v && setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cats.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("category")}
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} aria-invalid={!!errors.title || undefined} />
              {err("title")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issued date</Label>
                <Input type="date" value={form.issuedDate} onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry date</Label>
                <Input type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>File</Label>
              <Input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
              {err("file")}
            </div>
            <Button type="button" onClick={submit} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Upload"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
