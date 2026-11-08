"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Copy, Check, Link2, Mail, MessageSquare, Send, Share2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { FacebookIcon, LinkedinIcon, WhatsAppIcon, XIcon } from "@/components/icons/SocialIcons";
import { useBrand } from "@/components/platform/BrandProvider";

// `navigator.share` exists on most phones/tablets and some desktops; the server snapshot is `false` so hydration matches.
const noop = () => () => {};
const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/** Referral code + link with one-tap sharing to the common platforms. The link always points at the signup page with the code attached. */
export default function ReferralCodeCard({ code, link }: { code: string; link: string }) {
  const brand = useBrand();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeShare = useSyncExternalStore(noop, canNativeShare, () => false);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy(kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(kind === "code" ? code : link);
      setCopied(kind);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function shareNative() {
    try {
      await navigator.share({ title: `Join me on ${brand.name}`, text: message, url: link });
    } catch {
      /* dismissed by the user */
    }
  }

  const message = `Join me on ${brand.name} — sign up with my link and we both earn credits.`;
  const text = encodeURIComponent(`${message} ${link}`);
  const url = encodeURIComponent(link);
  const msg = encodeURIComponent(message);

  const pill = "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 hover:border-primary";
  const targets = [
    { label: "WhatsApp", href: `https://wa.me/?text=${text}`, icon: <WhatsAppIcon className="size-3.5" /> },
    { label: "Telegram", href: `https://t.me/share/url?url=${url}&text=${msg}`, icon: <Send className="size-3.5" /> },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${msg}`, icon: <FacebookIcon className="size-3.5" /> },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${msg}&url=${url}`, icon: <XIcon className="size-3.5" /> },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`, icon: <LinkedinIcon className="size-3.5" /> },
    { label: "Email", href: `mailto:?subject=${encodeURIComponent(`Join me on ${brand.name}`)}&body=${text}`, icon: <Mail className="size-3.5" />, sameTab: true },
  ];

  return (
    <GlassCard interactive={false}>
      <CardContent className="space-y-3 py-4">
        <p className="text-xs font-medium text-muted-foreground">Your referral code</p>
        <p className="font-mono text-3xl font-black tracking-widest text-foreground">{code}</p>

        <div className="flex flex-wrap gap-2 text-sm">
          {nativeShare && (
            <button type="button" onClick={shareNative} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 font-semibold text-primary-foreground">
              <Share2 className="size-3.5" /> Share
            </button>
          )}
          <button type="button" onClick={() => copy("code")} className={pill}>
            {copied === "code" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied === "code" ? "Copied!" : "Copy code"}
          </button>
          <button type="button" onClick={() => copy("link")} className={pill}>
            {copied === "link" ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />} {copied === "link" ? "Copied!" : "Copy link"}
          </button>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Share on</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {targets.map((t) => (
              <a key={t.label} href={t.href} {...(t.sameTab ? {} : { target: "_blank", rel: "noopener noreferrer" })} className={pill}>
                {t.icon} {t.label}
              </a>
            ))}
          </div>
        </div>

        <p className="break-all text-xs text-muted-foreground">{link}</p>
      </CardContent>
    </GlassCard>
  );
}
