"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import MultiPicker from "@/components/products/playbook-ai/MultiPicker";
import { createTestAction, saveTestInfoAction } from "@/app/(products)/evaliq/(protected)/actions";
import { DIFFICULTIES, TEST_TYPES } from "@/lib/products/evaliq/constants";

export interface TestInfoValues {
  name: string;
  description: string;
  categoryId: string;
  testType: string;
  subject: string;
  departmentIds: string[];
  designationIds: string[];
  difficulty: string;
  instructions: string;
  tags: string;
  language: string;
  certificate: { enabled: boolean; title: string; validityMonths: string };
}

type Opt = { value: string; label: string; sub?: string };

export default function TestInfoForm({
  id,
  initial,
  categories,
  departments,
  designations,
  next,
}: {
  id: string | null;
  initial: TestInfoValues;
  categories: Opt[];
  departments: Opt[];
  designations: Opt[];
  /** Where to go after saving (builder step). */
  next?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof TestInfoValues>(k: K, val: TestInfoValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const isCert = v.testType === "certification";

  function save() {
    start(async () => {
      const raw = { ...v, tags: v.tags, certificate: { ...v.certificate, enabled: isCert || v.certificate.enabled } };
      const res = id ? await saveTestInfoAction(id, raw) : await createTestAction(raw);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(id ? "Saved" : "Test created — now configure it");
      const target = id ?? (res as { id?: string }).id;
      router.push(next ?? `/evaliq/tests/${target}/edit?step=config`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="t-name">Test name</Label>
          <Input id="t-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="JavaScript Technical Assessment" />
        </div>
        <div className="space-y-1.5">
          <Label>Test type</Label>
          <OptionSelect value={v.testType} onChange={(x) => set("testType", x)} options={TEST_TYPES.map((t) => ({ value: t.value, label: t.label }))} aria-label="Test type" />
        </div>
        <div className="space-y-1.5">
          <Label>Test category</Label>
          <OptionSelect value={v.categoryId} onChange={(x) => set("categoryId", x)} options={categories} noneLabel="Uncategorised" aria-label="Test category" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-subject">Subject</Label>
          <Input id="t-subject" value={v.subject} onChange={(e) => set("subject", e.target.value)} placeholder="JavaScript" />
        </div>
        <div className="space-y-1.5">
          <Label>Difficulty</Label>
          <OptionSelect value={v.difficulty} onChange={(x) => set("difficulty", x)} options={DIFFICULTIES.map((d) => ({ value: d.value, label: d.label }))} aria-label="Difficulty" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-lang">Language</Label>
          <Input id="t-lang" value={v.language} onChange={(e) => set("language", e.target.value)} placeholder="English" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-tags">Tags (comma separated)</Label>
          <Input id="t-tags" value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder="frontend, hiring" />
        </div>
        <div className="space-y-1.5">
          <Label>Intended departments (TalentOS)</Label>
          <MultiPicker options={departments.map((d) => ({ id: d.value, label: d.label, sub: d.sub }))} value={v.departmentIds} onChange={(x) => set("departmentIds", x)} placeholder="Search departments…" emptyLabel="No departments in TalentOS." maxHeight="max-h-32" />
        </div>
        <div className="space-y-1.5">
          <Label>Intended roles / designations (TalentOS)</Label>
          <MultiPicker options={designations.map((d) => ({ id: d.value, label: d.label, sub: d.sub }))} value={v.designationIds} onChange={(x) => set("designationIds", x)} placeholder="Search roles…" emptyLabel="No designations in TalentOS." maxHeight="max-h-32" />
        </div>
        <p className="text-[11px] text-muted-foreground md:col-span-2">Departments and roles here describe who the test is for (and power report filters). Who actually receives it is decided when you assign it.</p>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="t-desc">Description</Label>
          <Textarea id="t-desc" value={v.description} onChange={(e) => set("description", e.target.value)} rows={3} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="t-instr">Instructions for candidates</Label>
          <Textarea id="t-instr" value={v.instructions} onChange={(e) => set("instructions", e.target.value)} rows={5} placeholder="Read each question carefully. You cannot pause the timer once you start…" />
        </div>
      </div>
      <div className="space-y-3 rounded-xl border border-border/50 p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={isCert || v.certificate.enabled} disabled={isCert} onChange={(e) => set("certificate", { ...v.certificate, enabled: e.target.checked })} />
          Issue a certificate when a candidate passes {isCert && <span className="text-xs font-normal text-muted-foreground">(always on for certification tests)</span>}
        </label>
        {(isCert || v.certificate.enabled) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-cert-title">Certificate title</Label>
              <Input id="t-cert-title" value={v.certificate.title} onChange={(e) => set("certificate", { ...v.certificate, title: e.target.value })} placeholder={`${v.name || "Test"} — Certified`} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-cert-valid">Validity (months)</Label>
              <Input id="t-cert-valid" type="number" min={1} value={v.certificate.validityMonths} onChange={(e) => set("certificate", { ...v.certificate, validityMonths: e.target.value })} placeholder="Settings default" />
            </div>
          </div>
        )}
      </div>
      <Button type="button" onClick={save} disabled={pending}>
        {pending && <Loader2 className="size-3.5 animate-spin" />} {id ? "Save & continue" : "Create test"}
      </Button>
    </div>
  );
}
