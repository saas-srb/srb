"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export interface FieldSpec {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea" | "checkbox";
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  /** Grid span within the two-column layout. */
  full?: boolean;
  suggestions?: string[];
  min?: number;
  step?: number;
}

export type SaveResult = { ok: boolean; error?: string; fieldErrors?: Record<string, string>; id?: string };

/**
 * Generic Sheet CRUD form driven by a field schema. Used by the simpler PRMS
 * modules (infrastructure, subscriptions, third-party, contracts, assets,
 * inventory items, budgets). The `action` is a server action taking the flat
 * form object + optional id.
 */
export default function ResourceForm({
  title,
  description,
  fields,
  initial = {},
  editId,
  action,
  trigger,
  submitLabel,
  onSaved,
}: {
  title: string;
  description: string;
  fields: FieldSpec[];
  initial?: Record<string, string | boolean>;
  editId?: string;
  action: (input: Record<string, unknown>, id?: string) => Promise<SaveResult>;
  trigger: ReactNode;
  submitLabel?: string;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<string, string | boolean>>(() => ({ ...initial }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;
  const sv = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
  const bv = (k: string) => form[k] === true;

  function onOpenChange(next: boolean) {
    if (next) {
      setForm({ ...initial });
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await action(form as Record<string, unknown>, editId);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(editId ? "Saved" : "Created");
      setOpen(false);
      if (result.id && onSaved) onSaved(result.id);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => {
              const listId = f.suggestions ? `rf-${f.name}` : undefined;
              return (
                <div key={f.name} className={`space-y-1.5 ${f.full || f.type === "textarea" ? "col-span-2" : ""}`}>
                  {f.type !== "checkbox" && <Label>{f.label}{f.required ? " *" : ""}</Label>}
                  {f.type === "select" ? (
                    <Select value={sv(f.name)} onValueChange={(v) => set(f.name, v ?? "")}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {(f.options ?? []).map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : f.type === "textarea" ? (
                    <Textarea value={sv(f.name)} onChange={(e) => set(f.name, e.target.value)} rows={3} placeholder={f.placeholder} />
                  ) : f.type === "checkbox" ? (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={bv(f.name)} onCheckedChange={(v) => set(f.name, v === true)} />
                      {f.label}
                    </label>
                  ) : (
                    <>
                      <Input
                        type={f.type}
                        value={sv(f.name)}
                        min={f.min}
                        step={f.step}
                        list={listId}
                        placeholder={f.placeholder}
                        onChange={(e) => set(f.name, e.target.value)}
                      />
                      {listId && (
                        <datalist id={listId}>
                          {f.suggestions!.map((o) => (
                            <option key={o} value={o} />
                          ))}
                        </datalist>
                      )}
                    </>
                  )}
                  {err(f.name)}
                </div>
              );
            })}
          </div>
          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : submitLabel ?? (editId ? "Save changes" : "Create")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
