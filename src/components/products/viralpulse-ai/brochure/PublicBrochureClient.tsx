"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Share2, QrCode, Phone, Mail, ArrowUp, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BrochureSectionRenderer } from "./BrochureSectionRenderer";
import type { BrochureDoc } from "@/lib/products/viralpulse-ai/brochure/types";
import QRCode from "qrcode";

interface PublicBrochureClientProps {
  brochure: {
    id: string;
    title: string;
    slug: string;
    category: string;
    sections: BrochureDoc["sections"];
    theme: BrochureDoc["theme"];
    meta: BrochureDoc["meta"];
  };
}

export default function PublicBrochureClient({ brochure }: PublicBrochureClientProps) {
  const [showShareModal, setShowShareModal] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Track view on load
  useEffect(() => {
    const width = window.innerWidth;
    const device = width < 640 ? "mobile" : width < 1024 ? "tablet" : "desktop";

    fetch("/api/viralpulse-ai/brochure/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brochureId: brochure.id,
        type: "view",
        referrer: typeof document !== "undefined" ? document.referrer : undefined,
        device,
      }),
    }).catch(() => {});

    // QR Code generation
    const url = window.location.href;
    QRCode.toDataURL(url, { width: 240, margin: 1 })
      .then(setQrUrl)
      .catch(() => {});

    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [brochure.id]);

  const handleTrackCta = (sectionType: string) => {
    fetch("/api/viralpulse-ai/brochure/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brochureId: brochure.id,
        type: "cta_click",
        section: sectionType,
      }),
    }).catch(() => {});
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="min-h-screen transition-colors duration-200"
      style={{
        backgroundColor: brochure.theme.backgroundColor,
        color: brochure.theme.textColor,
        fontFamily: brochure.theme.bodyFont,
      }}
    >
      {/* ── Brand Header Bar ── */}
      <header className="sticky top-0 z-40 border-b border-border/40 backdrop-blur-md bg-background/85 px-4 sm:px-8 py-3 transition-all print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {brochure.meta.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brochure.meta.logoUrl} alt={brochure.meta.brandName} className="h-8 max-w-[120px] object-contain" />
            ) : (
              <span className="text-sm font-extrabold uppercase tracking-wider text-primary truncate">
                {brochure.meta.brandName || brochure.title}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="text-xs gap-1.5 hidden sm:inline-flex"
            >
              <Download className="size-3.5" />
              Download PDF
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowShareModal(true)}
              className="text-xs gap-1.5"
            >
              <Share2 className="size-3.5" />
              Share
            </Button>

            <Button
              size="sm"
              style={{ backgroundColor: brochure.theme.primaryColor, color: "#ffffff" }}
              className="text-xs font-semibold"
              onClick={() => {
                const el = document.getElementById("contact");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Contact Us
            </Button>
          </div>
        </div>
      </header>

      {/* ── Sections ── */}
      <main className="divide-y divide-border/20">
        {brochure.sections.map((section) => (
          <BrochureSectionRenderer
            key={section.id}
            section={section}
            theme={brochure.theme}
            brochureId={brochure.id}
            brochureTitle={brochure.title}
            isEditorPreview={false}
            onTrackCta={handleTrackCta}
          />
        ))}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border/40 py-10 px-4 text-center text-xs text-muted-foreground print:text-black">
        <div className="mx-auto max-w-5xl space-y-2">
          <p className="font-semibold text-foreground">
            {brochure.meta.brandName || brochure.title}
          </p>
          <p>© {new Date().getFullYear()} All rights reserved. Generated with ViralPulse AI Brochure Builder.</p>
        </div>
      </footer>

      {/* ── Floating Controls ── */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 print:hidden">
        {showScrollTop && (
          <Button
            size="icon"
            variant="outline"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="rounded-full shadow-lg bg-background/90 backdrop-blur-md"
            title="Scroll to top"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}

        {brochure.meta.qrEnabled && qrUrl && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowShareModal(true)}
            className="rounded-full shadow-lg gap-2 text-xs bg-background/95 backdrop-blur-md border"
          >
            <QrCode className="size-4 text-primary" />
            <span className="hidden sm:inline">Scan / Share</span>
          </Button>
        )}
      </div>

      {/* ── Share Modal ── */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle>Share Brochure</DialogTitle>
            <DialogDescription>
              Scan the QR code on your mobile device or copy the public link.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center p-4 space-y-4">
            {qrUrl && (
              <div className="p-3 border rounded-2xl bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="QR Code" className="size-48" />
              </div>
            )}

            <div className="flex w-full items-center gap-2">
              <Input
                value={typeof window !== "undefined" ? window.location.href : ""}
                readOnly
                className="text-xs font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success("Link copied!");
                  }
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
