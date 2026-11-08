import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import SiteLogo from "@/components/SiteLogo";
import { socialIconFor } from "@/components/icons/social-icon-for";
import type { SiteInfo, SiteSocialLink } from "@/lib/products/sitecraft-ai/site-info-shared";

/** Social links to show: the Site Identity list, plus the LinkedIn page when it isn't already in it. */
export function socialLinks(info: SiteInfo): SiteSocialLink[] {
  const list = info.social.filter((s) => s.name && s.href);
  if (info.contact.linkedinHref && !list.some((s) => s.name.toLowerCase() === "linkedin")) list.push({ name: "LinkedIn", href: info.contact.linkedinHref });
  return list;
}

/** Logo mark + two-tone wordmark (+ subtitle), linking home. */
export function FooterBrand({ info, markClass = "w-9 h-9", nameClass = "text-2xl", subtitle = true, tone = "text-secondary-foreground" }: { info: SiteInfo; markClass?: string; nameClass?: string; subtitle?: boolean; tone?: string }) {
  const { brand } = info;
  return (
    <Link href="/" className="flex w-fit items-center gap-2.5">
      <SiteLogo logoUrl={brand.logoUrl} logoDarkUrl={brand.logoDarkUrl} className={markClass} />
      <span className="flex flex-col leading-none">
        <span className={`font-extrabold tracking-tight ${nameClass}`}>
          <span className={tone}>{brand.namePrimary}</span>
          <span className="text-primary">{brand.nameAccent}</span>
        </span>
        {subtitle && brand.subtitle && <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-secondary-foreground/85">{brand.subtitle}</span>}
      </span>
    </Link>
  );
}

/** Email / phone lines — only the ones the company has filled in. */
export function FooterContactLines({ info, className = "" }: { info: SiteInfo; className?: string }) {
  const { contact } = info;
  const hasPhone = !!contact.phoneHref && !!contact.phoneDisplay;
  if (!contact.email && !hasPhone) return null;
  const row = "flex items-center gap-2.5 text-sm text-secondary-foreground/85 transition-colors hover:text-primary";
  return (
    <div className={`space-y-2.5 ${className}`}>
      {contact.email && (
        <a href={`mailto:${contact.email}`} className={row}>
          <Mail className="h-4 w-4 flex-none" aria-hidden="true" />
          {contact.email}
        </a>
      )}
      {hasPhone && (
        <a href={contact.phoneHref} className={row}>
          <Phone className="h-4 w-4 flex-none" aria-hidden="true" />
          {contact.phoneDisplay}
        </a>
      )}
    </div>
  );
}

/** Round social icon buttons; nothing when there are no links. */
export function FooterSocialIcons({ info, className = "", size = "size-10" }: { info: SiteInfo; className?: string; size?: string }) {
  const links = socialLinks(info);
  if (links.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      {links.map((s) => {
        const Icon = socialIconFor(s.name);
        return (
          <a
            key={s.name}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${size} flex items-center justify-center rounded-full border border-secondary-foreground/15 bg-background/10 transition-all hover:scale-110 hover:border-primary hover:bg-primary hover:text-primary-foreground dark:border-white/10`}
          >
            <span className="sr-only">{s.name}</span>
            <Icon className="h-4 w-4" />
          </a>
        );
      })}
    </div>
  );
}

/** Copyright line with the two-tone wordmark. */
export function FooterCopyright({ info, className = "" }: { info: SiteInfo; className?: string }) {
  const { brand, footer } = info;
  return (
    <p className={`text-xs leading-5 text-secondary-foreground/85 ${className}`}>
      &copy; {new Date().getFullYear()} <span className="text-secondary-foreground">{brand.namePrimary}</span>
      <span className="text-primary">{brand.nameAccent}</span> {footer.copyright}
    </p>
  );
}

/** The footer's legal links, only when there are any. */
export function FooterLegalLinks({ info, className = "" }: { info: SiteInfo; className?: string }) {
  if (info.footer.legalLinks.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-secondary-foreground/85 ${className}`}>
      {info.footer.legalLinks.map((link) => (
        <Link key={link.href + link.label} href={link.href} className="transition-colors hover:text-primary">{link.label}</Link>
      ))}
    </div>
  );
}
