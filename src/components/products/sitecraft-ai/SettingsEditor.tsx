"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import type { CmsSettings } from "@/lib/products/sitecraft-ai/settings";
import { saveSettingsAction } from "@/app/(products)/sitecraft-ai/(protected)/settings/actions";

export default function SettingsEditor({ initial }: { initial: CmsSettings }) {
  const [settings, setSettings] = useState(initial);
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const res = await saveSettingsAction(settings);
      if (!res.ok) toast.error(res.error);
      else toast.success("Saved");
    });
  };

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <Label htmlFor="settings-maintenance">Maintenance mode</Label>
          <Checkbox id="settings-maintenance" checked={settings.maintenanceMode.enabled} onCheckedChange={(v) => setSettings((s) => ({ ...s, maintenanceMode: { ...s.maintenanceMode, enabled: v === true } }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-maintenance-title">Browser tab title</Label>
          <Input id="settings-maintenance-title" value={settings.maintenanceMode.title} onChange={(e) => setSettings((s) => ({ ...s, maintenanceMode: { ...s.maintenanceMode, title: e.target.value } }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-maintenance-heading">Heading</Label>
          <Input id="settings-maintenance-heading" value={settings.maintenanceMode.heading} onChange={(e) => setSettings((s) => ({ ...s, maintenanceMode: { ...s.maintenanceMode, heading: e.target.value } }))} />
        </div>
        <Textarea aria-label="Maintenance mode message" value={settings.maintenanceMode.message} onChange={(e) => setSettings((s) => ({ ...s, maintenanceMode: { ...s.maintenanceMode, message: e.target.value } }))} rows={2} />
        <p className="text-xs text-muted-foreground">When on, public visitors see a maintenance page (within about 10 seconds). You still see the real site while signed in to the CMS. Admin products and portal sign-in stay available.</p>
      </GlassCard>
      <GlassCard className="space-y-3 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="settings-og-image">Default social share image</Label>
          <Input id="settings-og-image" type="url" value={settings.defaultOgImage} onChange={(e) => setSettings((s) => ({ ...s, defaultOgImage: e.target.value }))} placeholder="https://…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-legal-name">Company legal name</Label>
          <Input id="settings-legal-name" value={settings.companyLegalName} onChange={(e) => setSettings((s) => ({ ...s, companyLegalName: e.target.value }))} />
        </div>
      </GlassCard>
      <Button onClick={save} disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
      </Button>
    </div>
  );
}
