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
import {
  PROGRAM_CATEGORIES,
  PROGRAM_STATUSES,
  TRAINING_MODES,
  SUPPORTED_CURRENCIES,
} from "@/lib/products/cohort-ai/constants";
import { saveProgramAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/programs/actions";
import type { SerializedProgram } from "@/lib/products/cohort-ai/programs";

type FormState = Record<string, string | boolean>;

function fromProgram(p: SerializedProgram | undefined, techSuggestions: string[]): FormState {
  if (!p) {
    return {
      category: "industrial",
      mode: "online",
      status: "draft",
      currency: "INR",
      certificateIncluded: true,
      placementAssistance: false,
      technology: techSuggestions[0] ?? "",
    };
  }
  return {
    name: p.name,
    category: p.category,
    technology: p.technology ?? "",
    durationWeeks: p.durationWeeks != null ? String(p.durationWeeks) : "",
    mode: p.mode,
    fees: p.fees != null ? String(p.fees) : "",
    currency: p.currency ?? "INR",
    description: p.description ?? "",
    learningOutcomes: p.learningOutcomes.join("\n"),
    tools: p.tools.join(", "),
    liveProjectCount: String(p.liveProjectCount ?? 0),
    certificateIncluded: p.certificateIncluded,
    placementAssistance: p.placementAssistance,
    status: p.status,
  };
}

export default function ProgramForm({
  program,
  technologySuggestions,
  trigger,
  onSaved,
}: {
  program?: SerializedProgram;
  technologySuggestions: string[];
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => fromProgram(program, technologySuggestions));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;
  const s = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
  const b = (k: string) => form[k] === true;

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(fromProgram(program, technologySuggestions));
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveProgramAction(form as Record<string, unknown>, program?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(program ? "Program updated" : "Program created");
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
          <SheetTitle>{program ? "Edit Program" : "New Program"}</SheetTitle>
          <SheetDescription>Track details, delivery, fees and outcomes.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Program name *</Label>
            <Input value={s("name")} onChange={(e) => set("name", e.target.value)} placeholder="e.g. MERN Stack Industrial Training" />
            {err("name")}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={s("category") || "industrial"} onValueChange={(v) => set("category", v ?? "industrial")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROGRAM_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={s("status") || "draft"} onValueChange={(v) => set("status", v ?? "draft")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROGRAM_STATUSES.map((st) => (
                    <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Technology / track</Label>
            <Input
              value={s("technology")}
              onChange={(e) => set("technology", e.target.value)}
              placeholder="e.g. Generative AI"
              list="tms-tech-suggestions"
            />
            <datalist id="tms-tech-suggestions">
              {technologySuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Duration (weeks)</Label>
              <Input type="number" min={0} value={s("durationWeeks")} onChange={(e) => set("durationWeeks", e.target.value)} />
              {err("durationWeeks")}
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={s("mode") || "online"} onValueChange={(v) => set("mode", v ?? "online")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRAINING_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Live projects</Label>
              <Input type="number" min={0} value={s("liveProjectCount")} onChange={(e) => set("liveProjectCount", e.target.value)} />
              {err("liveProjectCount")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fees</Label>
              <Input type="number" min={0} value={s("fees")} onChange={(e) => set("fees", e.target.value)} />
              {err("fees")}
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={s("currency") || "INR"} onValueChange={(v) => set("currency", v ?? "INR")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={s("description")} onChange={(e) => set("description", e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Learning outcomes</Label>
            <p className="text-xs text-muted-foreground">One per line.</p>
            <Textarea value={s("learningOutcomes")} onChange={(e) => set("learningOutcomes", e.target.value)} rows={4} />
          </div>
          <div className="space-y-1.5">
            <Label>Tools &amp; technologies</Label>
            <Input value={s("tools")} onChange={(e) => set("tools", e.target.value)} placeholder="comma, separated" />
          </div>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={b("certificateIncluded")} onCheckedChange={(v) => set("certificateIncluded", v === true)} />
              Certificate included
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={b("placementAssistance")} onCheckedChange={(v) => set("placementAssistance", v === true)} />
              Placement assistance
            </label>
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : program ? "Save changes" : "Create program"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
