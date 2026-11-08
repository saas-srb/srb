"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Mail, Phone, Globe, MapPin, MessageCircle, Calendar, Download, Share2,
  RotateCw, Columns2, QrCode as QrIcon, Check, Copy, ExternalLink, Building2, User, FileText,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import VCardPreview, { type CardViewMode } from "./VCardPreview";
import type { VCardDetail, VCardSection } from "@/lib/products/viralpulse-ai/vcard/types";

// ── Clean SVG Social Icons ────────────────────────────────────────────────────

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
    </svg>
  );
}

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface PublicVCardClientProps {
  card: VCardDetail;
}

function ContactLink({
  icon: Icon,
  label,
  href,
  value,
  action,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  value?: string;
  action?: string;
}) {
  if (!value) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-card hover:border-primary/40 hover:bg-primary/5 transition-all group shadow-xs"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
          <Icon className="size-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider">{label}</p>
          <p className="text-sm font-semibold truncate text-foreground">{value}</p>
        </div>
      </div>
      {action && (
        <span className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex items-center gap-1">
          {action} <ExternalLink className="size-3" />
        </span>
      )}
    </a>
  );
}

export default function PublicVCardClient({ card }: PublicVCardClientProps) {
  const [viewMode, setViewMode] = useState<CardViewMode>("flip");
  const [showQrModal, setShowQrModal] = useState(false);
  const [largeQrUrl, setLargeQrUrl] = useState<string | null>(null);

  const publicUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `https://viralpulse.ai/vcard/${card.slug}`;

  useEffect(() => {
    // Track public view
    fetch("/api/viralpulse-ai/vcard/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: card.slug, type: "view" }),
    }).catch(() => {});

    // Generate high-res QR for modal
    QRCode.toDataURL(publicUrl, {
      width: 256,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((url) => setLargeQrUrl(url))
      .catch(() => {});
  }, [card.slug, publicUrl]);

  const handleDownloadVcf = () => {
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${card.name}`,
      `TITLE:${card.jobTitle}`,
      `ORG:${card.company}`,
      card.contact.email ? `EMAIL:${card.contact.email}` : "",
      card.contact.phone ? `TEL;TYPE=WORK:${card.contact.phone}` : "",
      card.contact.mobile ? `TEL;TYPE=CELL:${card.contact.mobile}` : "",
      card.contact.website ? `URL:${card.contact.website}` : "",
      card.branding.tagline ? `NOTE:${card.branding.tagline}` : "",
      card.contact.address ? `ADR;TYPE=WORK:;;${card.contact.address};${card.contact.city || ""};;${card.contact.country || ""}` : "",
      "END:VCARD",
    ].filter(Boolean).join("\r\n");

    const blob = new Blob([lines], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${card.name.replace(/\s+/g, "_")}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Contact file saved to device!");

    fetch("/api/viralpulse-ai/vcard/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: card.slug, id: card.id, type: "cta_click" }),
    }).catch(() => {});
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `${card.name} — ${card.jobTitle}`,
        text: `Connect with ${card.name} (${card.jobTitle} at ${card.company})`,
        url: publicUrl,
      }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copied to clipboard!");
    }
    fetch("/api/viralpulse-ai/vcard/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: card.slug, id: card.id, type: "share" }),
    }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-md px-4 py-3 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
              VP
            </div>
            <span className="text-xs font-semibold text-muted-foreground">Digital Visiting Card</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setViewMode(viewMode === "flip" ? "both" : "flip")}
              className="gap-1.5 text-xs font-medium"
            >
              {viewMode === "flip" ? <Columns2 className="size-3.5" /> : <RotateCw className="size-3.5" />}
              <span>{viewMode === "flip" ? "View Both Sides" : "3D Flip View"}</span>
            </Button>
            <Button variant="outline" size="xs" onClick={handleShare} className="gap-1.5 text-xs font-medium">
              <Share2 className="size-3.5" /> Share
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Card Component Container */}
        <section className="flex flex-col items-center justify-center">
          <div className="py-2">
            <VCardPreview
              card={card}
              mode={viewMode}
              publicUrl={publicUrl}
              showControls={viewMode === "flip"}
            />
          </div>
          {viewMode === "flip" && (
            <p className="text-[11px] text-muted-foreground mt-1 text-center">
              Tap or click the card to flip between <strong>Front (Company Identity)</strong> and <strong>Back (Personal Info)</strong>
            </p>
          )}
        </section>

        {/* Primary Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Button size="lg" className="gap-2 font-bold shadow-md" onClick={handleDownloadVcf}>
            <Download className="size-4" /> Save (.vcf)
          </Button>
          <a
            href={`/api/viralpulse-ai/vcard/${card.id}/pdf`}
            download={`${card.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_VisitingCard.pdf`}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2 font-bold border-primary/30 text-primary hover:bg-primary/5")}
          >
            <FileText className="size-4 text-primary" /> Download PDF
          </a>
          <Button variant="outline" size="lg" className="gap-2 font-semibold" onClick={() => setShowQrModal(true)}>
            <QrIcon className="size-4" /> Scan QR
          </Button>
          <Button variant="outline" size="lg" className="gap-2 font-semibold" onClick={handleShare}>
            <Share2 className="size-4" /> Share Card
          </Button>
        </div>

        {/* Person & Organization Header */}
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-xs space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{card.name}</h1>
              <p className="text-base font-semibold text-primary">{card.jobTitle}</p>
              <p className="text-sm font-medium text-muted-foreground mt-0.5">{card.company}</p>
            </div>
            {card.branding.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.branding.avatar} alt={card.name} className="size-16 rounded-2xl object-cover border-2 shadow-sm shrink-0" style={{ borderColor: card.style.primaryColor }} />
            ) : (
              <div
                className="size-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shrink-0 shadow-sm"
                style={{ backgroundColor: card.style.primaryColor }}
              >
                {card.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {card.branding.tagline && (
            <p className="text-xs italic text-muted-foreground pt-1 border-t border-border/40">
              "{card.branding.tagline}"
            </p>
          )}

          {card.bio && (
            <div className="pt-2 text-sm text-muted-foreground leading-relaxed border-t border-border/40">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground mb-1">About</p>
              <p>{card.bio}</p>
            </div>
          )}
        </div>

        {/* Direct Contact Channels */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Phone className="size-3.5 text-primary" /> Direct Contact
          </h2>
          <div className="space-y-2">
            <ContactLink
              icon={Mail}
              label="Email"
              value={card.contact.email}
              href={`mailto:${card.contact.email}`}
              action="Send Mail"
            />
            <ContactLink
              icon={Phone}
              label="Direct Call"
              value={card.contact.phone || card.contact.mobile}
              href={`tel:${card.contact.phone || card.contact.mobile}`}
              action="Call Now"
            />
            {card.contact.whatsapp && (
              <ContactLink
                icon={MessageCircle}
                label="WhatsApp"
                value={card.contact.whatsapp}
                href={`https://wa.me/${card.contact.whatsapp.replace(/\D/g, "")}`}
                action="Message"
              />
            )}
            <ContactLink
              icon={Globe}
              label="Website"
              value={card.contact.website}
              href={card.contact.website || "#"}
              action="Visit"
            />
            {(card.contact.address || card.contact.city) && (
              <ContactLink
                icon={MapPin}
                label="Office Location"
                value={[card.contact.address, card.contact.city, card.contact.country].filter(Boolean).join(", ")}
                href={`https://maps.google.com/?q=${encodeURIComponent([card.contact.address, card.contact.city, card.contact.country].filter(Boolean).join(", "))}`}
                action="Get Directions"
              />
            )}
          </div>
        </section>

        {/* Social & Professional Connections */}
        {(card.contact.linkedin || card.contact.twitter || card.contact.instagram || card.contact.facebook || card.contact.calendly) && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Globe className="size-3.5 text-primary" /> Professional Networks
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {card.contact.linkedin && (
                <ContactLink icon={LinkedInIcon} label="LinkedIn" value="Connect on LinkedIn" href={card.contact.linkedin} action="Open" />
              )}
              {card.contact.twitter && (
                <ContactLink icon={TwitterIcon} label="Twitter / X" value="Follow on X" href={card.contact.twitter} action="Open" />
              )}
              {card.contact.instagram && (
                <ContactLink icon={InstagramIcon} label="Instagram" value="Follow on Instagram" href={card.contact.instagram} action="Open" />
              )}
              {card.contact.facebook && (
                <ContactLink icon={FacebookIcon} label="Facebook" value="View Facebook Profile" href={card.contact.facebook} action="Open" />
              )}
              {card.contact.calendly && (
                <ContactLink icon={Calendar} label="Schedule Meeting" value="Book on Calendly" href={card.contact.calendly} action="Book" />
              )}
            </div>
          </section>
        )}

        {/* Dynamic Sections (Services, Skills, etc.) */}
        {card.sections.filter((s) => !s.hidden).map((sec) => (
          <div key={sec.id} className="rounded-2xl border border-border/50 bg-card p-5 shadow-xs space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{sec.title || sec.type}</h2>
            {sec.type === "services" && Array.isArray((sec.content as { items?: { label: string }[] }).items) && (
              <div className="flex flex-wrap gap-2">
                {((sec.content as { items?: { label: string }[] }).items || []).map((item, i) => (
                  <span key={i} className="text-xs px-3 py-1.5 rounded-full border border-border/60 bg-muted/40 font-medium">
                    {item.label}
                  </span>
                ))}
              </div>
            )}
            {sec.type === "skills" && Array.isArray((sec.content as { items?: { label: string }[] }).items) && (
              <div className="flex flex-wrap gap-2">
                {((sec.content as { items?: { label: string }[] }).items || []).map((item, i) => (
                  <Badge key={i} variant="secondary" className="text-xs py-1 px-2.5">{item.label}</Badge>
                ))}
              </div>
            )}
            {sec.type === "cta" && (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-center space-y-2">
                <p className="text-base font-bold text-foreground">{String((sec.content as Record<string, unknown>).headline || "")}</p>
                <p className="text-xs text-muted-foreground">{String((sec.content as Record<string, unknown>).body || "")}</p>
                <Button size="sm" onClick={handleDownloadVcf} className="mt-2">
                  {String((sec.content as Record<string, unknown>).buttonLabel || "Connect")}
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* Footer */}
        <footer className="text-center pt-6 pb-12 text-xs text-muted-foreground border-t border-border/40 space-y-2">
          <p>
            Powered by <strong className="text-foreground">ViralPulse AI</strong> · AI Business Visiting Cards
          </p>
          <div className="flex justify-center gap-4 text-[11px]">
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="hover:underline">
              Back to Top
            </button>
            <span>·</span>
            <button type="button" onClick={handleShare} className="hover:underline">
              Share Card
            </button>
          </div>
        </footer>
      </main>

      {/* ── QR Code Modal ── */}
      <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2">
              <QrIcon className="size-5 text-primary" /> Scan Digital Visiting Card
            </DialogTitle>
            <DialogDescription>
              Scan with any mobile camera to view and instantly save this contact card.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl border shadow-inner my-2">
            {largeQrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={largeQrUrl} alt="Card QR Code" className="size-48 object-contain" />
            ) : (
              <div className="size-48 flex items-center justify-center text-muted-foreground">Loading QR...</div>
            )}
            <p className="text-xs font-semibold text-slate-800 mt-2">{card.name}</p>
            <p className="text-[11px] text-slate-500">{card.company}</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={publicUrl}
              className="flex-1 text-[11px] font-mono px-2.5 py-1.5 rounded-lg border bg-muted/40 text-muted-foreground truncate"
            />
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(publicUrl);
                toast.success("Link copied!");
              }}
            >
              <Copy className="size-3" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
