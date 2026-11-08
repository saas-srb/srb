"use client";

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";
import type { VCardDetail } from "@/lib/products/viralpulse-ai/vcard/types";
import {
  Mail,
  Phone,
  Globe,
  MapPin,
  MessageCircle,
  Calendar,
  RotateCw,
  QrCode as QrIcon,
  Building2,
  Sparkles,
} from "lucide-react";

export type CardViewMode = "flip" | "front" | "back" | "both";

interface VCardPreviewProps {
  card: VCardDetail;
  isEditorPreview?: boolean;
  scale?: number;
  initialFlipped?: boolean;
  mode?: CardViewMode;
  onFlipChange?: (flipped: boolean) => void;
  publicUrl?: string;
  showControls?: boolean;
}

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

function ContactRow({ icon: Icon, value, href }: { icon: React.ElementType; value?: string; href?: string }) {
  if (!value) return null;
  const content = (
    <span className="flex items-center gap-1.5 text-[11px] truncate leading-tight">
      <Icon className="size-3 shrink-0 opacity-70" />
      <span className="truncate">{value}</span>
    </span>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
        {content}
      </a>
    );
  }
  return content;
}

function SocialRow({ contact, primaryColor }: { contact: VCardDetail["contact"]; primaryColor: string }) {
  const links = [
    { icon: LinkedInIcon, value: contact.linkedin, href: contact.linkedin },
    { icon: TwitterIcon, value: contact.twitter, href: contact.twitter },
    { icon: InstagramIcon, value: contact.instagram, href: contact.instagram },
    { icon: FacebookIcon, value: contact.facebook, href: contact.facebook },
    { icon: MessageCircle, value: contact.whatsapp, href: contact.whatsapp ? `https://wa.me/${contact.whatsapp.replace(/\D/g, "")}` : undefined },
    { icon: Calendar, value: contact.calendly, href: contact.calendly },
  ].filter((l) => l.value);

  if (links.length === 0) return null;

  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      {links.slice(0, 5).map((l, i) => (
        <a
          key={i}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex size-6 items-center justify-center rounded-full border border-current/25 hover:opacity-80 transition-opacity"
          style={{ color: primaryColor }}
        >
          <l.icon className="size-3" />
        </a>
      ))}
    </div>
  );
}

// ── QR Code Thumbnail ─────────────────────────────────────────────────────────

function CardQrCode({ text, color, bgColor }: { text: string; color: string; bgColor: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!text) return;
    QRCode.toDataURL(text, {
      width: 64,
      margin: 1,
      color: {
        dark: color || "#000000",
        light: bgColor || "#ffffff",
      },
    })
      .then((url) => setDataUrl(url))
      .catch(() => {});
  }, [text, color, bgColor]);

  if (!dataUrl) {
    return (
      <div className="size-11 rounded border border-current/20 flex items-center justify-center opacity-60">
        <QrIcon className="size-5" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dataUrl} alt="QR Code" className="size-11 rounded border border-current/15 object-contain shadow-xs" />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── FRONT FACES (Company Branding Side) ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function ClassicFront({ card, qrUrl }: { card: VCardDetail; qrUrl: string }) {
  const { style, branding } = card;
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-6 relative overflow-hidden select-none"
      style={{ backgroundColor: style.backgroundColor, color: style.textColor, fontFamily: style.fontFamily }}
    >
      {/* Decorative frame */}
      <div className="absolute inset-2.5 rounded-lg border border-dashed opacity-25 pointer-events-none" style={{ borderColor: style.primaryColor }} />

      {/* Top right minimal logo/emblem */}
      <div className="flex items-center justify-between z-10">
        <span className="text-[10px] font-semibold uppercase tracking-widest opacity-60">Company Profile</span>
        <div className="size-2 rounded-full" style={{ backgroundColor: style.primaryColor }} />
      </div>

      {/* Centered Company Branding */}
      <div className="flex flex-col items-center justify-center text-center my-auto z-10 px-4">
        {branding.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logo} alt={card.company} className="h-10 max-w-[140px] object-contain mb-2" />
        ) : (
          <div
            className="size-12 rounded-xl flex items-center justify-center text-xl font-bold mb-2 shadow-xs"
            style={{ backgroundColor: style.primaryColor, color: "#fff" }}
          >
            {card.company ? card.company.charAt(0).toUpperCase() : <Building2 className="size-6" />}
          </div>
        )}
        <h2 className="text-xl font-bold tracking-tight leading-snug truncate max-w-full" style={{ color: style.primaryColor }}>
          {card.company || "Company Name"}
        </h2>
        {branding.tagline && (
          <p className="text-xs mt-1 italic opacity-75 max-w-[280px] line-clamp-2 leading-relaxed">
            {branding.tagline}
          </p>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between text-[10px] opacity-60 z-10 border-t pt-2" style={{ borderColor: style.accentColor }}>
        <span className="truncate">{card.contact.website || card.contact.email || "Official Business Card"}</span>
        <CardQrCode text={qrUrl} color={style.textColor} bgColor={style.backgroundColor} />
      </div>
    </div>
  );
}

function ModernFront({ card }: { card: VCardDetail }) {
  const { style, branding } = card;
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-6 relative overflow-hidden select-none text-white"
      style={{
        background: `linear-gradient(135deg, ${style.primaryColor} 0%, ${style.secondaryColor} 100%)`,
        fontFamily: style.fontFamily,
      }}
    >
      {/* Dynamic ambient shapes */}
      <div className="absolute -top-10 -right-10 size-36 rounded-full bg-white/10 blur-xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 size-36 rounded-full bg-black/10 blur-xl pointer-events-none" />

      {/* Top row */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-semibold tracking-wide backdrop-blur-xs">
          <Sparkles className="size-3" /> Verified Business
        </div>
        <span className="text-[10px] uppercase tracking-widest opacity-70">Corporate</span>
      </div>

      {/* Center content */}
      <div className="flex flex-col items-center justify-center text-center my-auto z-10 px-2">
        {branding.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logo} alt={card.company} className="h-10 max-w-[140px] object-contain mb-2" />
        ) : (
          <div className="size-14 rounded-2xl flex items-center justify-center text-2xl font-black mb-2 bg-white/20 backdrop-blur-md border border-white/30 shadow-lg">
            {card.company ? card.company.charAt(0).toUpperCase() : <Building2 className="size-7" />}
          </div>
        )}
        <h2 className="text-2xl font-black tracking-tight leading-tight drop-shadow-xs truncate max-w-full">
          {card.company || "Company Name"}
        </h2>
        {branding.tagline && (
          <p className="text-xs mt-1.5 opacity-85 font-medium line-clamp-2 max-w-[280px]">
            {branding.tagline}
          </p>
        )}
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between text-[11px] opacity-80 z-10 border-t border-white/20 pt-2 font-mono">
        <span className="truncate">{card.contact.website || "www.company.com"}</span>
        <span className="text-[10px] tracking-wider uppercase">Tap to view contact</span>
      </div>
    </div>
  );
}

function MinimalFront({ card }: { card: VCardDetail }) {
  const { style, branding } = card;
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-7 select-none"
      style={{ backgroundColor: style.backgroundColor, color: style.textColor, fontFamily: style.fontFamily }}
    >
      <div className="flex justify-between items-start">
        <div className="size-8 rounded-full border border-current/30 flex items-center justify-center text-sm font-semibold" style={{ color: style.primaryColor }}>
          {card.company ? card.company.charAt(0).toUpperCase() : "C"}
        </div>
        <span className="text-[10px] uppercase tracking-widest opacity-40">Identity</span>
      </div>

      <div className="my-auto">
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: style.primaryColor }}>
          {card.company || "Company Name"}
        </h2>
        {branding.tagline && (
          <p className="text-xs opacity-60 mt-1 font-normal tracking-wide">
            {branding.tagline}
          </p>
        )}
      </div>

      <div className="text-[10px] opacity-40 uppercase tracking-widest flex items-center justify-between border-t pt-2" style={{ borderColor: style.accentColor }}>
        <span>{card.contact.city ? `${card.contact.city}, ${card.contact.country || ""}` : "Global"}</span>
        <span>{card.contact.website ? card.contact.website.replace(/^https?:\/\//, "") : ""}</span>
      </div>
    </div>
  );
}

function BoldFront({ card, qrUrl }: { card: VCardDetail; qrUrl: string }) {
  const { style, branding } = card;
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-6 relative overflow-hidden select-none"
      style={{ backgroundColor: style.backgroundColor || "#0f172a", color: "#f8fafc", fontFamily: style.fontFamily }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: style.primaryColor }} />

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-2">
          <div className="size-3 rounded-xs" style={{ backgroundColor: style.primaryColor }} />
          <span className="text-[10px] font-bold tracking-widest uppercase opacity-75">Corporate</span>
        </div>
        <CardQrCode text={qrUrl} color="#ffffff" bgColor={style.backgroundColor || "#0f172a"} />
      </div>

      <div className="my-auto">
        <h2 className="text-2xl font-black tracking-tight uppercase leading-tight text-white">
          {card.company || "Company Name"}
        </h2>
        {branding.tagline && (
          <p className="text-xs mt-1.5 font-medium line-clamp-2" style={{ color: style.primaryColor }}>
            {branding.tagline}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono opacity-60 border-t border-white/10 pt-2">
        <span>{card.contact.website || card.contact.email || "Official Card"}</span>
        <span className="uppercase tracking-widest">Front Face</span>
      </div>
    </div>
  );
}

function CreativeFront({ card }: { card: VCardDetail }) {
  const { style, branding } = card;
  return (
    <div
      className="w-full h-full relative overflow-hidden select-none"
      style={{ backgroundColor: style.backgroundColor, color: style.textColor, fontFamily: style.fontFamily }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${style.primaryColor} 0%, ${style.primaryColor} 55%, ${style.backgroundColor} 55%)`,
        }}
      />
      <div className="relative z-10 flex flex-col justify-between h-full p-6">
        <div className="text-white">
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Studio / Agency</span>
        </div>

        <div className="my-auto text-white">
          <div className="size-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-xl font-bold mb-2">
            {card.company ? card.company.charAt(0).toUpperCase() : "A"}
          </div>
          <h2 className="text-xl font-black leading-tight drop-shadow-xs">
            {card.company || "Creative Studio"}
          </h2>
          {branding.tagline && (
            <p className="text-xs opacity-80 mt-1 line-clamp-2 italic">
              {branding.tagline}
            </p>
          )}
        </div>

        <div className="flex justify-end text-xs font-semibold" style={{ color: style.primaryColor }}>
          <span>{card.contact.website || "Portfolio"}</span>
        </div>
      </div>
    </div>
  );
}

function ExecutiveFront({ card, qrUrl }: { card: VCardDetail; qrUrl: string }) {
  const { style, branding } = card;
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-6 relative overflow-hidden select-none border-2"
      style={{
        backgroundColor: style.backgroundColor,
        color: style.textColor,
        borderColor: style.primaryColor,
        fontFamily: style.fontFamily,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="h-0.5 w-12" style={{ backgroundColor: style.primaryColor }} />
        <span className="text-[10px] font-serif uppercase tracking-widest opacity-60">Executive Crest</span>
        <div className="h-0.5 w-12" style={{ backgroundColor: style.primaryColor }} />
      </div>

      <div className="flex flex-col items-center justify-center text-center my-auto px-4">
        <div
          className="size-14 rounded-full border-2 flex items-center justify-center text-xl font-serif font-bold mb-2.5 shadow-xs"
          style={{ borderColor: style.primaryColor, color: style.primaryColor }}
        >
          {card.company ? card.company.charAt(0).toUpperCase() : "E"}
        </div>
        <h2 className="text-xl font-serif font-bold tracking-tight leading-snug" style={{ color: style.primaryColor }}>
          {card.company || "Executive Enterprise"}
        </h2>
        {branding.tagline && (
          <p className="text-xs mt-1 font-serif italic opacity-75 max-w-[260px] line-clamp-2">
            {branding.tagline}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] opacity-60 border-t pt-2" style={{ borderColor: style.accentColor }}>
        <span>{card.contact.city ? `${card.contact.city}, ${card.contact.country || ""}` : "Headquarters"}</span>
        <CardQrCode text={qrUrl} color={style.textColor} bgColor={style.backgroundColor} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── BACK FACES (Personal & Contact Information Side) ──────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function ClassicBack({ card, qrUrl }: { card: VCardDetail; qrUrl: string }) {
  const { style, branding, contact } = card;
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-5 select-none"
      style={{ backgroundColor: style.backgroundColor, color: style.textColor, fontFamily: style.fontFamily }}
    >
      {/* Header with avatar & name */}
      <div className="flex items-center justify-between pb-2.5 border-b" style={{ borderColor: style.accentColor }}>
        <div className="flex items-center gap-3 min-w-0">
          {branding.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.avatar} alt={card.name} className="size-11 rounded-full object-cover shrink-0 border-2" style={{ borderColor: style.primaryColor }} />
          ) : (
            <div
              className="size-11 rounded-full shrink-0 flex items-center justify-center text-base font-bold shadow-xs"
              style={{ backgroundColor: style.primaryColor, color: "#fff" }}
            >
              {card.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-sm font-bold truncate leading-tight" style={{ color: style.primaryColor }}>
              {card.name}
            </h1>
            <p className="text-[11px] font-medium opacity-85 truncate">{card.jobTitle}</p>
            <p className="text-[10px] opacity-60 truncate">{card.company}</p>
          </div>
        </div>
        <CardQrCode text={qrUrl} color={style.textColor} bgColor={style.backgroundColor} />
      </div>

      {/* Contact Grid */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 py-2">
        <ContactRow icon={Mail} value={contact.email} href={`mailto:${contact.email}`} />
        <ContactRow icon={Phone} value={contact.phone || contact.mobile} href={`tel:${contact.phone || contact.mobile}`} />
        <ContactRow icon={Globe} value={contact.website} href={contact.website} />
        <ContactRow icon={MapPin} value={[contact.city, contact.country].filter(Boolean).join(", ")} />
      </div>

      {/* Footer social icons */}
      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: style.accentColor }}>
        <SocialRow contact={contact} primaryColor={style.primaryColor} />
        <span className="text-[9px] uppercase tracking-wider opacity-40 font-mono">Personal & Direct</span>
      </div>
    </div>
  );
}

function ModernBack({ card, qrUrl }: { card: VCardDetail; qrUrl: string }) {
  const { style, branding, contact } = card;
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-5 select-none"
      style={{ backgroundColor: style.backgroundColor, color: style.textColor, fontFamily: style.fontFamily }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {branding.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.avatar} alt={card.name} className="size-12 rounded-xl object-cover shrink-0 border" style={{ borderColor: style.primaryColor }} />
          ) : (
            <div
              className="size-12 rounded-xl shrink-0 flex items-center justify-center text-lg font-black text-white"
              style={{ background: `linear-gradient(135deg, ${style.primaryColor}, ${style.secondaryColor})` }}
            >
              {card.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-sm font-bold truncate leading-tight" style={{ color: style.primaryColor }}>
              {card.name}
            </h1>
            <p className="text-[11px] font-semibold opacity-90 truncate">{card.jobTitle}</p>
            <span className="inline-block text-[10px] px-1.5 py-0.2 rounded-sm bg-muted/60 opacity-70 mt-0.5 truncate max-w-full">
              {card.company}
            </span>
          </div>
        </div>
        <CardQrCode text={qrUrl} color={style.textColor} bgColor={style.backgroundColor} />
      </div>

      <div className="space-y-1.5 py-2">
        <ContactRow icon={Mail} value={contact.email} href={`mailto:${contact.email}`} />
        <ContactRow icon={Phone} value={contact.phone || contact.mobile} href={`tel:${contact.phone || contact.mobile}`} />
        <ContactRow icon={Globe} value={contact.website} href={contact.website} />
        <ContactRow icon={MapPin} value={[contact.city, contact.country].filter(Boolean).join(", ")} />
      </div>

      <div className="flex items-center justify-between pt-1.5 border-t" style={{ borderColor: style.accentColor }}>
        <SocialRow contact={contact} primaryColor={style.primaryColor} />
        <span className="text-[9px] opacity-40 font-mono">Scan QR for instant save</span>
      </div>
    </div>
  );
}

function MinimalBack({ card, qrUrl }: { card: VCardDetail; qrUrl: string }) {
  const { style, contact } = card;
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-6 select-none"
      style={{ backgroundColor: style.backgroundColor, color: style.textColor, fontFamily: style.fontFamily }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight" style={{ color: style.primaryColor }}>
            {card.name}
          </h1>
          <p className="text-xs opacity-75">{card.jobTitle}</p>
          <p className="text-[10px] opacity-50 uppercase tracking-widest mt-0.5">{card.company}</p>
        </div>
        <CardQrCode text={qrUrl} color={style.textColor} bgColor={style.backgroundColor} />
      </div>

      <div className="space-y-1 py-1 text-xs">
        <ContactRow icon={Mail} value={contact.email} href={`mailto:${contact.email}`} />
        <ContactRow icon={Phone} value={contact.phone || contact.mobile} href={`tel:${contact.phone || contact.mobile}`} />
        <ContactRow icon={Globe} value={contact.website} href={contact.website} />
        <ContactRow icon={MapPin} value={[contact.city, contact.country].filter(Boolean).join(", ")} />
      </div>

      <div className="pt-2 border-t flex items-center justify-between" style={{ borderColor: style.accentColor }}>
        <SocialRow contact={contact} primaryColor={style.primaryColor} />
        <span className="text-[9px] opacity-40 uppercase tracking-widest">Connect</span>
      </div>
    </div>
  );
}

function BoldBack({ card, qrUrl }: { card: VCardDetail; qrUrl: string }) {
  const { style, branding, contact } = card;
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-5 select-none"
      style={{ backgroundColor: style.backgroundColor || "#0f172a", color: "#f8fafc", fontFamily: style.fontFamily }}
    >
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-3">
          {branding.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.avatar} alt={card.name} className="size-11 rounded-lg object-cover" />
          ) : (
            <div
              className="size-11 rounded-lg flex items-center justify-center text-lg font-black text-white"
              style={{ backgroundColor: style.primaryColor }}
            >
              {card.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-sm font-black tracking-tight text-white">{card.name}</h1>
            <p className="text-[11px] font-bold" style={{ color: style.primaryColor }}>{card.jobTitle}</p>
            <p className="text-[10px] opacity-60 text-white">{card.company}</p>
          </div>
        </div>
        <CardQrCode text={qrUrl} color="#ffffff" bgColor={style.backgroundColor || "#0f172a"} />
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 py-2 text-white/85">
        <ContactRow icon={Mail} value={contact.email} href={`mailto:${contact.email}`} />
        <ContactRow icon={Phone} value={contact.phone || contact.mobile} href={`tel:${contact.phone || contact.mobile}`} />
        <ContactRow icon={Globe} value={contact.website} href={contact.website} />
        <ContactRow icon={MapPin} value={[contact.city, contact.country].filter(Boolean).join(", ")} />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <SocialRow contact={contact} primaryColor={style.primaryColor} />
        <span className="text-[9px] font-mono text-white/40 uppercase">Direct Access</span>
      </div>
    </div>
  );
}

function CreativeBack({ card, qrUrl }: { card: VCardDetail; qrUrl: string }) {
  const { style, contact } = card;
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-5 select-none relative overflow-hidden"
      style={{ backgroundColor: style.backgroundColor, color: style.textColor, fontFamily: style.fontFamily }}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[9px] uppercase tracking-widest font-bold opacity-50">{card.company}</span>
          <h1 className="text-base font-black leading-tight" style={{ color: style.primaryColor }}>
            {card.name}
          </h1>
          <p className="text-xs font-semibold opacity-80">{card.jobTitle}</p>
        </div>
        <CardQrCode text={qrUrl} color={style.textColor} bgColor={style.backgroundColor} />
      </div>

      <div className="space-y-1 py-1.5">
        <ContactRow icon={Mail} value={contact.email} href={`mailto:${contact.email}`} />
        <ContactRow icon={Phone} value={contact.phone || contact.mobile} href={`tel:${contact.phone || contact.mobile}`} />
        <ContactRow icon={Globe} value={contact.website} href={contact.website} />
        <ContactRow icon={MapPin} value={[contact.city, contact.country].filter(Boolean).join(", ")} />
      </div>

      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: style.accentColor }}>
        <SocialRow contact={contact} primaryColor={style.primaryColor} />
        <span className="text-[9px] font-semibold opacity-60">Digital Card</span>
      </div>
    </div>
  );
}

function ExecutiveBack({ card, qrUrl }: { card: VCardDetail; qrUrl: string }) {
  const { style, contact } = card;
  return (
    <div
      className="w-full h-full flex select-none"
      style={{ fontFamily: style.fontFamily }}
    >
      {/* Left accent column */}
      <div
        className="w-16 shrink-0 flex flex-col items-center justify-between py-4 px-1"
        style={{ backgroundColor: style.primaryColor }}
      >
        <div className="size-9 rounded-full border border-white/40 flex items-center justify-center text-sm font-serif font-bold text-white">
          {card.name.charAt(0).toUpperCase()}
        </div>
        <CardQrCode text={qrUrl} color="#ffffff" bgColor={style.primaryColor} />
      </div>

      {/* Main content */}
      <div
        className="flex-1 flex flex-col justify-between p-4"
        style={{ backgroundColor: style.backgroundColor, color: style.textColor }}
      >
        <div>
          <h1 className="text-sm font-serif font-bold leading-tight" style={{ color: style.primaryColor }}>
            {card.name}
          </h1>
          <p className="text-[11px] font-medium opacity-85">{card.jobTitle}</p>
          <p className="text-[9px] uppercase tracking-widest opacity-50 mt-0.5">{card.company}</p>
        </div>

        <div className="space-y-1 py-1 border-t" style={{ borderColor: style.accentColor }}>
          <ContactRow icon={Mail} value={contact.email} href={`mailto:${contact.email}`} />
          <ContactRow icon={Phone} value={contact.phone || contact.mobile} href={`tel:${contact.phone || contact.mobile}`} />
          <ContactRow icon={Globe} value={contact.website} href={contact.website} />
          <ContactRow icon={MapPin} value={[contact.city, contact.country].filter(Boolean).join(", ")} />
        </div>

        <div className="pt-1">
          <SocialRow contact={contact} primaryColor={style.primaryColor} />
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── CARD FACE DISPATCHERS ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export function CardFace({ card, face, qrUrl }: { card: VCardDetail; face: "front" | "back"; qrUrl: string }) {
  if (face === "front") {
    switch (card.layout) {
      case "modern": return <ModernFront card={card} />;
      case "minimal": return <MinimalFront card={card} />;
      case "bold": return <BoldFront card={card} qrUrl={qrUrl} />;
      case "creative": return <CreativeFront card={card} />;
      case "executive": return <ExecutiveFront card={card} qrUrl={qrUrl} />;
      case "classic":
      default:
        return <ClassicFront card={card} qrUrl={qrUrl} />;
    }
  }

  switch (card.layout) {
    case "modern": return <ModernBack card={card} qrUrl={qrUrl} />;
    case "minimal": return <MinimalBack card={card} qrUrl={qrUrl} />;
    case "bold": return <BoldBack card={card} qrUrl={qrUrl} />;
    case "creative": return <CreativeBack card={card} qrUrl={qrUrl} />;
    case "executive": return <ExecutiveBack card={card} qrUrl={qrUrl} />;
    case "classic":
    default:
      return <ClassicBack card={card} qrUrl={qrUrl} />;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN VCardPreview EXPORT ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function VCardPreview({
  card,
  isEditorPreview = false,
  scale,
  initialFlipped = false,
  mode = "flip",
  onFlipChange,
  publicUrl,
  showControls = true,
}: VCardPreviewProps) {
  const [isFlipped, setIsFlipped] = useState(initialFlipped);

  const qrTarget =
    publicUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/vcard/${card.slug}`
      : `https://viralpulse.ai/vcard/${card.slug}`);

  const handleFlip = () => {
    const next = !isFlipped;
    setIsFlipped(next);
    onFlipChange?.(next);
  };

  const cardDimensions = {
    width: "360px",
    height: "210px",
  };

  const borderRadius =
    card.style.borderRadius === "lg"
      ? "14px"
      : card.style.borderRadius === "xl"
      ? "18px"
      : "10px";

  // Mode: "both" — Render both Front and Back side-by-side
  if (mode === "both") {
    return (
      <div className="flex flex-col sm:flex-row gap-6 items-center justify-center">
        {/* Front */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Building2 className="size-3.5 text-primary" /> Front (Company Branding)
          </div>
          <div
            className={cn(
              "shadow-xl border border-border/40 overflow-hidden relative",
              isEditorPreview && "ring-1 ring-primary/20"
            )}
            style={{ ...cardDimensions, borderRadius }}
          >
            <CardFace card={card} face="front" qrUrl={qrTarget} />
          </div>
        </div>

        {/* Back */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Mail className="size-3.5 text-primary" /> Back (Personal & Contact)
          </div>
          <div
            className={cn(
              "shadow-xl border border-border/40 overflow-hidden relative",
              isEditorPreview && "ring-1 ring-primary/20"
            )}
            style={{ ...cardDimensions, borderRadius }}
          >
            <CardFace card={card} face="back" qrUrl={qrTarget} />
          </div>
        </div>
      </div>
    );
  }

  // Mode: "front" only
  if (mode === "front") {
    return (
      <div
        className={cn("shadow-xl border border-border/40 overflow-hidden relative", isEditorPreview && "ring-1 ring-primary/20")}
        style={{ ...cardDimensions, borderRadius }}
      >
        <CardFace card={card} face="front" qrUrl={qrTarget} />
      </div>
    );
  }

  // Mode: "back" only
  if (mode === "back") {
    return (
      <div
        className={cn("shadow-xl border border-border/40 overflow-hidden relative", isEditorPreview && "ring-1 ring-primary/20")}
        style={{ ...cardDimensions, borderRadius }}
      >
        <CardFace card={card} face="back" qrUrl={qrTarget} />
      </div>
    );
  }

  // Default mode: "flip" (3D Interactive Flip Card)
  return (
    <div className="flex flex-col items-center gap-3">
      {/* 3D Flip Container */}
      <div
        className="group relative cursor-pointer"
        style={{
          perspective: "1200px",
          width: cardDimensions.width,
          height: cardDimensions.height,
          ...(scale ? { transform: `scale(${scale})`, transformOrigin: "top center" } : {}),
        }}
        onClick={handleFlip}
        title="Click to flip card"
      >
        <div
          className="w-full h-full relative transition-transform duration-600 ease-out shadow-2xl"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            borderRadius,
          }}
        >
          {/* FRONT FACE */}
          <div
            className="absolute inset-0 w-full h-full overflow-hidden border border-border/40 backface-hidden"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              borderRadius,
            }}
          >
            <CardFace card={card} face="front" qrUrl={qrTarget} />
          </div>

          {/* BACK FACE */}
          <div
            className="absolute inset-0 w-full h-full overflow-hidden border border-border/40 backface-hidden"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              borderRadius,
            }}
          >
            <CardFace card={card} face="back" qrUrl={qrTarget} />
          </div>
        </div>
      </div>

      {/* Flip control badge */}
      {showControls && (
        <button
          type="button"
          onClick={handleFlip}
          className="flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-background/80 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground shadow-xs transition-all backdrop-blur-xs"
        >
          <RotateCw className="size-3 text-primary transition-transform group-hover:rotate-180" />
          <span>
            Showing: <strong className="text-foreground">{isFlipped ? "Back (Personal)" : "Front (Company)"}</strong>
          </span>
          <span className="text-[10px] opacity-60">· Click to flip</span>
        </button>
      )}
    </div>
  );
}
