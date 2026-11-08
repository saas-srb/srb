"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import CampaignImportSheet from "@/components/products/dealflow-ai/campaigns/CampaignImportSheet";

export default function CampaignImportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-3.5" data-icon="inline-start" />
        Import data
      </Button>
      <CampaignImportSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
