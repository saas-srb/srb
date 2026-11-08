"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export interface InvoiceFilterValues {
  q: string;
  company: string;
  status: string;
  kind: string;
  fy: string;
  from: string;
  to: string;
}

type Option = { value: string; label: string };

function FilterSelect({ id, label, value, options, onChange, width = "w-40" }: { id: string; label: string; value: string; options: Option[]; onChange: (v: string | undefined) => void; width?: string }) {
  const items = [{ value: "all", label: options[0]?.label ?? "All" }, ...options.slice(1)];
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <Select items={items} value={value || "all"} onValueChange={(v) => onChange(!v || v === "all" ? undefined : String(v))}>
        <SelectTrigger id={id} aria-label={label} className={`h-9 ${width} max-w-full rounded-xl border-border/50 bg-background`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function InvoicesFilterBar({ initial, companies, financialYears }: { initial: InvoiceFilterValues; companies: { id: string; name: string }[]; financialYears: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(initial.q);

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== initial.q) updateParams({ q: searchInput || undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="invoice-search">
          Search
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="invoice-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Number, company or payment ref"
            className="h-9 w-64 max-w-full rounded-xl border-border/50 bg-background pl-8"
          />
        </div>
      </div>
      <FilterSelect id="invoice-company" label="Company" width="w-48" value={initial.company} onChange={(v) => updateParams({ company: v })} options={[{ value: "all", label: "All companies" }, ...companies.map((c) => ({ value: c.id, label: c.name }))]} />
      <FilterSelect
        id="invoice-status"
        label="Status"
        value={initial.status}
        onChange={(v) => updateParams({ status: v })}
        options={[
          { value: "all", label: "Any status" },
          { value: "paid", label: "Paid" },
          { value: "unpaid", label: "Unpaid" },
          { value: "void", label: "Void" },
        ]}
      />
      <FilterSelect
        id="invoice-kind"
        label="Type"
        value={initial.kind}
        onChange={(v) => updateParams({ kind: v })}
        options={[
          { value: "all", label: "Invoices & credit notes" },
          { value: "invoice", label: "Invoices" },
          { value: "credit_note", label: "Credit notes" },
        ]}
        width="w-52"
      />
      <FilterSelect id="invoice-fy" label="Financial year" value={initial.fy} onChange={(v) => updateParams({ fy: v })} options={[{ value: "all", label: "All years" }, ...financialYears.map((fy) => ({ value: fy, label: `FY ${fy}` }))]} />
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="invoice-from">
          From
        </label>
        <Input id="invoice-from" type="date" defaultValue={initial.from} onChange={(e) => updateParams({ from: e.target.value || undefined })} className="h-9 w-40 rounded-xl border-border/50 bg-background" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="invoice-to">
          To
        </label>
        <Input id="invoice-to" type="date" defaultValue={initial.to} onChange={(e) => updateParams({ to: e.target.value || undefined })} className="h-9 w-40 rounded-xl border-border/50 bg-background" />
      </div>
    </>
  );
}
