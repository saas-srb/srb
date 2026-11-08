"use client";

import { usePanelLabel } from "@/components/platform/PanelsProvider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Link as LinkIcon, CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { brandify } from "@/lib/brand";

export default function PaymentLinkCreateDialog() {
  const panelLabel = usePanelLabel();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    amount: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    expiresInDays: "7",
    sourceModule: "DIRECT",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/cashflow-ai/payments/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          amount: Number(formData.amount),
          customerName: formData.customerName,
          customerEmail: formData.customerEmail,
          customerPhone: formData.customerPhone,
          expiresInDays: Number(formData.expiresInDays),
          sourceModule: formData.sourceModule || "DIRECT",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to create payment link");
      }

      setCreatedUrl(data.publicUrl);
      toast.success("Direct Payment Link Created!");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5 mr-1" />
        Create Payment Link
      </Button>

      <Dialog open={open} onOpenChange={(val) => {
        setOpen(val);
        if (!val) setCreatedUrl(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-border/60 pb-3">
            <DialogTitle>Create Direct Payment Link</DialogTitle>
            <DialogDescription>
              Generate a secure tokenized URL (`/pay/[token]`) for public payment collection.
            </DialogDescription>
          </DialogHeader>

          {createdUrl ? (
            <div className="py-6 space-y-4 text-center">
              <div className="size-12 bg-green-500/15 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto border border-green-500/20">
                <CheckCircle2 className="size-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Link Generated Successfully</h3>
                <p className="text-xs text-muted-foreground mt-1">Share this link with your customer</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-xl border border-border text-xs font-mono select-all break-all text-primary font-medium">
                {createdUrl}
              </div>
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(createdUrl);
                  toast.success("Link copied to clipboard!");
                }}
                className="w-full gap-2"
              >
                <Copy className="size-3.5" />
                Copy Payment URL
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="py-3 space-y-3.5 text-xs">
              <div className="space-y-1.5">
                <Label>Target Portal / Source Product</Label>
                <select
                  value={formData.sourceModule}
                  onChange={(e) => setFormData({ ...formData, sourceModule: e.target.value })}
                  className="w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="DIRECT">Direct Payment Link</option>
                  <option value="TMS">{panelLabel("tms", "TMS")} Student Portal (Course Fee)</option>
                  <option value="PMS">{panelLabel("pms", "PMS")} Client Portal (Project Invoice)</option>
                  <option value="HRMS">{panelLabel("hrms", "HRMS")} Employee Portal</option>
                  <option value="PRMS">{panelLabel("prms", "PRMS")} Vendor Portal</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Purpose / Title *</Label>
                <Input
                  required
                  placeholder="e.g. Generative AI Training Fee / Milestone Payment"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount (₹) *</Label>
                  <Input
                    type="number"
                    required
                    placeholder="15000"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Expiry (Days)</Label>
                  <Input
                    type="number"
                    placeholder="7"
                    value={formData.expiresInDays}
                    onChange={(e) => setFormData({ ...formData, expiresInDays: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Customer Name *</Label>
                <Input
                  required
                  placeholder="Vijay Singh"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Customer Email *</Label>
                <Input
                  type="email"
                  required
                  placeholder="vijay@example.com"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Description / Notes</Label>
                <Textarea
                  rows={2}
                  placeholder="Additional details for the customer"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              {errorMsg && (
                <p className="text-destructive text-xs font-medium">{errorMsg}</p>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-border/60">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : "Generate Link"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
