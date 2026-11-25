"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export function Field({ name, label, error, type = "text", multiline = false, accept, required = false }: { name: string; label: string; error?: string; type?: string; multiline?: boolean; accept?: string; required?: boolean }) {
  const id = `f-${name}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? <Textarea id={id} name={name} rows={4} aria-invalid={!!error} /> : <Input id={id} name={name} type={type} accept={accept} required={required} aria-invalid={!!error} />}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Shown after a form is sent. A new portal account's one-time password is never put in the address. */
export function Sent({ message, again }: { message: string; again: () => void }) {
  return (
    <div role="status" className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
      <p className="font-semibold">{message}</p>
      <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={again}>
        Send another
      </button>
    </div>
  );
}
