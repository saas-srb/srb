"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type Result = { ok: boolean; error?: string };

/**
 * A button that opens a small dialog with one input (a URL, a date/time …),
 * an optional checkbox, and calls a server action with the values.
 */
export default function InputDialogButton({
  children,
  title,
  description,
  inputLabel,
  inputType = "text",
  placeholder,
  defaultValue = "",
  required = false,
  checkbox,
  submitLabel = "Save",
  success = "Saved",
  action,
  variant = "outline",
  size = "sm",
}: {
  children: ReactNode;
  title: string;
  description?: string;
  inputLabel: string;
  inputType?: "text" | "url" | "datetime-local";
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  checkbox?: { label: string; defaultChecked?: boolean };
  submitLabel?: string;
  success?: string;
  action: (value: string, checked: boolean) => Promise<Result>;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  size?: "sm" | "xs" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [checked, setChecked] = useState(checkbox?.defaultChecked ?? false);
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      // datetime-local has no zone — send an absolute instant from the browser's zone.
      const v = inputType === "datetime-local" && value ? new Date(value).toISOString() : value;
      const res = await action(v, checked);
      if (!res.ok) toast.error(res.error ?? "Could not complete that.");
      else {
        toast.success(success);
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-1.5">
              <label className="text-xs font-medium" htmlFor="idb-input">{inputLabel}</label>
              <Input id="idb-input" type={inputType} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} required={required} />
            </div>
            {checkbox && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="size-4 accent-[var(--primary)]" />
                {checkbox.label}
              </label>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending || (required && !value.trim())}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
