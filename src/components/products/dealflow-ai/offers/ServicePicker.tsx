"use client";

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CATEGORIES, getSubServices, type CategorySlug } from "@/lib/categories";

/** Cascading category → sub-service picker, sourced live from the real service taxonomy. */
export default function ServicePicker({
  category,
  subService,
  onCategoryChange,
  onSubServiceChange,
  allowAllSubService = false,
}: {
  category: CategorySlug | "";
  subService: string;
  onCategoryChange: (value: CategorySlug) => void;
  onSubServiceChange: (value: string) => void;
  allowAllSubService?: boolean;
}) {
  const subServices = category ? getSubServices(category) : [];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Category</label>
        <Select value={category || undefined} onValueChange={(v) => v && onCategoryChange(v as CategorySlug)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Choose a category" /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Sub-service</label>
        <Select value={subService || undefined} onValueChange={(v) => v && onSubServiceChange(v)} disabled={!category}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Choose a sub-service" /></SelectTrigger>
          <SelectContent>
            {allowAllSubService && <SelectItem value="all">Whole category</SelectItem>}
            {subServices.map((s) => <SelectItem key={s.slug} value={s.slug}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
