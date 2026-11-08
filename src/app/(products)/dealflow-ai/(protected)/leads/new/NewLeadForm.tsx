"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createManualLeadAction } from "../actions";

const TYPES = [
  { value: "job_applicant", label: "Job Applicant" },
  { value: "intern", label: "Intern" },
  { value: "trainee", label: "Trainee (Industrial Training)" },
  { value: "client", label: "Client" },
];

export default function NewLeadForm() {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", phone: "", type: "client", message: "" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createManualLeadAction(form);
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Full name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Lead type</Label>
        <Select value={form.type} onValueChange={(v) => v && setForm({ ...form, type: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Notes / requirement (optional)</Label>
        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Create lead + account"}
      </Button>
    </form>
  );
}
