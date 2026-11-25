"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CAREER_APPLICATION_STATUSES } from "@/lib/career-application-status";
import { addCandidateAction, setCandidateStatusAction } from "@/app/(products)/talentos/(protected)/recruitment/actions";

const FIELDS: { name: string; label: string; type?: string }[] = [
  { name: "name", label: "Full name" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "positionTitle", label: "Role" },
];

/** Adds a candidate by hand (name, contact, role and resume). */
export function AddCandidate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const res = await addCandidateAction(data).catch(() => null);
      if (!res?.ok) {
        setErrors(res?.fieldErrors ?? {});
        toast.error(res ? "Please fix the highlighted fields." : "Could not add the candidate. Try again.");
        return;
      }
      toast.success("Candidate added");
      setOpen(false);
      setErrors({});
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" size="sm"><UserPlus className="size-3.5" data-icon="inline-start" />Add candidate</Button>} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Add a candidate</SheetTitle>
          <SheetDescription>Someone who applied to you directly. Move them to Selected to make an offer.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="flex-1 space-y-3 overflow-y-auto p-4">
          {FIELDS.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label htmlFor={`cand-${f.name}`}>{f.label}</Label>
              <Input id={`cand-${f.name}`} name={f.name} type={f.type ?? "text"} />
              {err(f.name)}
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="cand-resume">Resume</Label>
            <Input id="cand-resume" name="resume" type="file" accept=".pdf,.doc,.docx" />
            {err("resume")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cand-note">Note (optional)</Label>
            <Textarea id="cand-note" name="coverNote" rows={3} />
            {err("coverNote")}
          </div>
          <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Add candidate"}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function CandidateStatusSelect({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(next) => {
        if (!next || next === status) return;
        start(async () => {
          const res = await setCandidateStatusAction(id, next).catch(() => null);
          if (!res?.ok) toast.error(res?.error ?? "Could not change the status.");
          else router.refresh();
        });
      }}
    >
      <SelectTrigger className="w-48" aria-label="Candidate status">
        <SelectValue>{CAREER_APPLICATION_STATUSES.find((s) => s.value === status)?.label ?? status}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CAREER_APPLICATION_STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
