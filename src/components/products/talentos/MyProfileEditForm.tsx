"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMyContactAction } from "@/app/(products)/talentos/(protected)/me/profile/actions";

interface Contact {
  name: string;
  relationship: string;
  phone: string;
}

export default function MyProfileEditForm({
  initial,
}: {
  initial: {
    phone: string;
    personalEmail: string;
    addressLine: string;
    city: string;
    state: string;
    postalCode: string;
    emergencyContacts: Contact[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState(initial);
  const [contacts, setContacts] = useState<Contact[]>(
    initial.emergencyContacts.length ? initial.emergencyContacts : [{ name: "", relationship: "", phone: "" }]
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const result = await updateMyContactAction({
        ...form,
        emergencyContacts: contacts.filter((c) => c.name.trim() && c.phone.trim()),
      });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Details updated");
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Contact Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} aria-invalid={!!errors.phone || undefined} />
            {err("phone")}
          </div>
          <div className="space-y-1.5">
            <Label>Personal email</Label>
            <Input type="email" value={form.personalEmail} onChange={(e) => setForm((f) => ({ ...f, personalEmail: e.target.value }))} aria-invalid={!!errors.personalEmail || undefined} />
            {err("personalEmail")}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address</Label>
            <Input value={form.addressLine} onChange={(e) => setForm((f) => ({ ...f, addressLine: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Postal code</Label>
            <Input value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} />
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Emergency Contacts</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {contacts.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input placeholder="Name" value={c.name} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input placeholder="Relationship" value={c.relationship} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)))} />
              <Input placeholder="Phone" value={c.phone} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setContacts((cs) => (cs.length > 1 ? cs.filter((_, j) => j !== i) : cs))} aria-label="Remove">
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setContacts((cs) => [...cs, { name: "", relationship: "", phone: "" }])}>
            <Plus className="size-3.5" data-icon="inline-start" />
            Add contact
          </Button>
        </CardContent>
      </GlassCard>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Save Changes"}
      </Button>
    </form>
  );
}
