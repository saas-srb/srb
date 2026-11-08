"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PanelContent, PanelBody, PanelHeader, PanelTitle, PanelDescription, PanelFooter } from "@/components/products/sitecraft-ai/ui/SidePanel";
import type { CmsThemeDoc } from "@/lib/products/sitecraft-ai/theme";
import { createThemeAction } from "@/app/(products)/sitecraft-ai/(protected)/theme/actions";

/** "New theme" side product: a copy of an installed theme under a new name/key. */
export default function NewThemePanelContent({
  themes,
  onClose,
  onCreated,
}: {
  themes: CmsThemeDoc[];
  onClose: () => void;
  onCreated: (doc: CmsThemeDoc) => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [cloneFromKey, setCloneFromKey] = useState(themes[0]?._id ?? "default");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await createThemeAction({ key: key || name, name, description, cloneFromKey });
      if (!res.ok) { toast.error(res.error); return; }
      const source = themes.find((t) => t._id === cloneFromKey);
      onCreated({
        _id: res.key,
        name,
        description,
        builtIn: false,
        tokens: source?.tokens ?? themes[0].tokens,
        draftTokens: source?.tokens ?? themes[0].tokens,
        components: source?.components,
        draftComponents: source?.components,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      });
    });
  };

  return (
    <PanelContent>
      <PanelHeader>
        <PanelTitle>New theme</PanelTitle>
        <PanelDescription>Starts as a copy of an existing theme&apos;s colours, fonts and layout choices — customize it afterward.</PanelDescription>
      </PanelHeader>
      <PanelBody>
        <div className="space-y-1.5">
          <Label htmlFor="new-theme-name">Name</Label>
          <Input id="new-theme-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="AI Technology Theme" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-theme-key">Key (used in URLs)</Label>
          <Input id="new-theme-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="ai-technology" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-theme-description">Description</Label>
          <Textarea id="new-theme-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-theme-clone">Clone tokens from</Label>
          <Select value={cloneFromKey} onValueChange={(v) => setCloneFromKey((v as string) ?? themes[0]._id)}>
            <SelectTrigger id="new-theme-clone" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {themes.map((t) => (
                <SelectItem key={t._id} value={t._id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PanelBody>
      <PanelFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !name.trim()}>
          Create
        </Button>
      </PanelFooter>
    </PanelContent>
  );
}
