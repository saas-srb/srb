"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { SITES_MODULE } from "@/lib/platform/products/selection";
import { setCompanyProductsAction } from "./products-actions";

export default function CompanyProductsCard({ companyId, choices, current, website, externalUrl, canEdit }: { companyId: string; choices: { key: string; name: string }[]; current: string[] | null; website: string; externalUrl: string; canEdit: boolean }) {
  const router = useRouter();
  const [all, setAll] = useState(current === null);
  const [picked, setPicked] = useState<string[]>(current ?? []);
  const [site, setSite] = useState(website);
  const [url, setUrl] = useState(externalUrl);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const siteChoice = all || !picked.includes(SITES_MODULE);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await setCompanyProductsAction(companyId, { products: all ? ["all"] : picked, website: site, externalUrl: url, reason }).catch(() => ({ ok: false as const, error: "Could not save. Try again." }));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setReason("");
      router.refresh();
    });
  };

  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">Products and website</CardTitle>
        <CardDescription>What this company has. Access changes at once; a paid subscription is re-priced from its next renewal. No data is deleted.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3 text-sm">
          <fieldset disabled={!canEdit || pending} className="space-y-3">
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All products
            </label>
            {!all && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {choices.map((c) => (
                  <label key={c.key} className="flex items-center gap-2">
                    <input type="checkbox" checked={picked.includes(c.key)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.key] : p.filter((k) => k !== c.key)))} /> {c.name}
                  </label>
                ))}
              </div>
            )}
            {siteChoice && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cp-site">Website</Label>
                  <select id="cp-site" value={site} onChange={(e) => setSite(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {all && <option value="platform">Run here</option>}
                    <option value="external">Their own website</option>
                    <option value="none">No website</option>
                  </select>
                </div>
                {site === "external" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-url">Their website address</Label>
                    <Input id="cp-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
                  </div>
                )}
              </div>
            )}
            {canEdit && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-60 flex-1 space-y-1.5">
                  <Label htmlFor="cp-reason">Reason</Label>
                  <Input id="cp-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
                </div>
                <Button type="submit" size="sm" disabled={reason.trim().length < 3 || (!all && picked.length === 0)}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : "Save products"}
                </Button>
              </div>
            )}
          </fieldset>
        </form>
      </CardContent>
    </GlassCard>
  );
}
