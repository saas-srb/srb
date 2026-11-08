"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { PlatformGeneralInput } from "@/lib/platform/settings";
import { savePlatformSettingsAction } from "./actions";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";
const areaClass =
  "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

export default function PlatformSettingsForm({ initial, builtInReserved, timezones }: { initial: PlatformGeneralInput; builtInReserved: string[]; timezones: string[] }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [reserved, setReserved] = useState(initial.reservedSubdomains.join(", "));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = (k: keyof PlatformGeneralInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setV((p) => ({ ...p, [k]: e.target.value }));
  };
  const err = (k: string) => (errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : null);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        start(async () => {
          const res = await savePlatformSettingsAction({ ...v, reservedSubdomains: reserved.split(/[\s,]+/).filter(Boolean) });
          if (res.ok) {
            setErrors({});
            setSaved(true);
            router.refresh();
          } else setErrors(res.errors);
        });
      }}
    >
      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Platform identity</CardTitle>
          <CardDescription>Shown in the platform&apos;s own emails (sign-up, approvals, test emails) and pages.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ps-name">Platform name</Label>
            <Input id="ps-name" value={v.platformName} onChange={set("platformName")} maxLength={60} />
            {err("platformName")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-support-email">Support email (optional)</Label>
            <Input id="ps-support-email" type="email" value={v.supportEmail} onChange={set("supportEmail")} placeholder="support@example.com" />
            {err("supportEmail")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-support-url">Support URL (optional)</Label>
            <Input id="ps-support-url" type="url" value={v.supportUrl} onChange={set("supportUrl")} placeholder="https://help.example.com" />
            {err("supportUrl")}
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Defaults for new companies</CardTitle>
          <CardDescription>Applied when a company is created; its owner can change the time zone during setup.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ps-locale">Locale</Label>
            <Input id="ps-locale" value={v.defaultLocale} onChange={set("defaultLocale")} placeholder="en-IN" />
            {err("defaultLocale")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-timezone">Time zone</Label>
            <select id="ps-timezone" className={selectClass} value={v.defaultTimezone} onChange={set("defaultTimezone")}>
              {!timezones.includes(v.defaultTimezone) && <option value={v.defaultTimezone}>{v.defaultTimezone || "Choose…"}</option>}
              {timezones.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {err("defaultTimezone")}
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Maintenance banner</CardTitle>
          <CardDescription>While set, this message shows on every company&apos;s products. Leave empty to hide it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="ps-banner">Message</Label>
          <textarea id="ps-banner" className={areaClass} value={v.maintenanceBanner} onChange={set("maintenanceBanner")} maxLength={280} placeholder="Scheduled maintenance on Sunday 02:00–03:00 IST. The products may be briefly unavailable." />
          <p className="text-xs text-muted-foreground">{v.maintenanceBanner.length}/280</p>
          {err("maintenanceBanner")}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Reserved subdomains</CardTitle>
          <CardDescription>Workspace addresses no new company can take. Existing companies are never affected.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="ps-reserved">Additional reserved subdomains</Label>
          <textarea id="ps-reserved" className={areaClass} value={reserved} onChange={(e) => { setSaved(false); setReserved(e.target.value); }} placeholder="demo, staging, sales" />
          <p className="text-xs text-muted-foreground">Comma or line separated. Always reserved: {builtInReserved.join(", ")}.</p>
          {err("reservedSubdomains")}
        </CardContent>
      </GlassCard>

      <div className="flex flex-wrap items-center gap-3">
        <Button id="ps-save" type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Save settings"}
        </Button>
        {saved && <span className="text-sm text-emerald-600" aria-live="polite">Saved.</span>}
        {Object.keys(errors).length > 0 && <span className="text-sm text-destructive" aria-live="polite">Fix the highlighted fields.</span>}
      </div>
    </form>
  );
}
