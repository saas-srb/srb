import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/SocialIcons";
import type { SiteInfo } from "@/lib/products/sitecraft-ai/site-info-shared";
import type { PublicFooterColumn } from "@/lib/products/sitecraft-ai/footer";
import { FooterBrand, FooterContactLines, FooterSocialIcons, FooterCopyright, FooterLegalLinks, socialLinks } from "@/components/footer/FooterParts";

/**
 * The footer layouts a theme can pick besides "standard" and "compact"
 * (src/lib/sitecraft-ai/component-variants.ts). Same content sources as every footer:
 * CMS footer columns + Site Identity — different structure.
 */

type Props = { cmsFooter: PublicFooterColumn[]; siteInfo: SiteInfo };

const shell = "relative mt-auto overflow-hidden border-t border-border";

function allLinks(columns: PublicFooterColumn[], limit: number) {
  return columns.flatMap((c) => c.links).slice(0, limit);
}

/** Everything stacked and centered. */
export function FooterCentered({ cmsFooter, siteInfo }: Props) {
  const { footer, contact, display } = siteInfo;
  const show = display.footer;
  const whatsapp = show.whatsappButton && !!contact.whatsappHref && !!footer.whatsappLabel;
  return (
    <footer className={`${shell} bg-secondary text-secondary-foreground dark:bg-card`}>
      <div className="mx-auto flex max-w-5xl flex-col items-center px-6 py-16 text-center lg:px-8">
        <FooterBrand info={siteInfo} />
        {show.about && footer.about && <p className="mt-5 max-w-md text-sm leading-6 text-secondary-foreground/85">{footer.about}</p>}

        {show.ctaBand && footer.ctaTitle && (
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            {footer.ctaHref && footer.ctaLabel && (
              <Link href={footer.ctaHref} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform hover:scale-105">
                {footer.ctaLabel} <ArrowRight className="size-4" />
              </Link>
            )}
            {whatsapp && (
              <a href={contact.whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background transition-transform hover:scale-105">
                <WhatsAppIcon className="size-4" /> {footer.whatsappLabel}
              </a>
            )}
          </div>
        )}

        <nav aria-label="Footer" className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
          {allLinks(cmsFooter, 10).map((link) => (
            <Link key={link.href + link.label} href={link.href} className="text-sm font-medium text-secondary-foreground/85 transition-colors hover:text-primary">{link.label}</Link>
          ))}
        </nav>

        {show.social && socialLinks(siteInfo).length > 0 && <FooterSocialIcons info={siteInfo} className="mt-8 justify-center" />}
        {show.contact && <FooterContactLines info={siteInfo} className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-2 space-y-0" />}

        <div className="mt-10 w-full border-t border-secondary-foreground/10 pt-6">
          <FooterCopyright info={siteInfo} />
          <FooterLegalLinks info={siteInfo} className="mt-2 justify-center" />
        </div>
      </div>
    </footer>
  );
}

/** Inverted dark footer: big call to action on the left, link columns on the right. */
export function FooterSplit({ cmsFooter, siteInfo }: Props) {
  const { brand, footer, contact, display } = siteInfo;
  const show = display.footer;
  const whatsapp = show.whatsappButton && !!contact.whatsappHref && !!footer.whatsappLabel;
  return (
    <footer className="relative mt-auto overflow-hidden bg-foreground text-background">
      <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-primary/25 blur-[110px]" />
      <div className="relative mx-auto grid max-w-7xl gap-14 px-6 py-16 lg:grid-cols-2 lg:px-8">
        <div>
          <span className="inline-flex items-center gap-2 text-2xl font-black tracking-tight">
            {brand.namePrimary}<span className="text-primary">{brand.nameAccent}</span>
          </span>
          {show.ctaBand && footer.ctaTitle ? (
            <>
              <h3 className="mt-6 max-w-md text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">{footer.ctaTitle}</h3>
              {footer.ctaText && <p className="mt-4 max-w-md text-base text-background/70">{footer.ctaText}</p>}
            </>
          ) : (
            show.about && footer.about && <p className="mt-6 max-w-md text-base text-background/70">{footer.about}</p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {show.ctaBand && footer.ctaHref && footer.ctaLabel && (
              <Link href={footer.ctaHref} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform hover:scale-105">
                {footer.ctaLabel} <ArrowRight className="size-4" />
              </Link>
            )}
            {whatsapp && (
              <a href={contact.whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-background/25 px-6 py-3 text-sm font-bold transition-colors hover:bg-background/10">
                <WhatsAppIcon className="size-4" /> {footer.whatsappLabel}
              </a>
            )}
          </div>
          {show.contact && (contact.email || contact.phoneDisplay) && (
            <div className="mt-8 space-y-1 text-sm text-background/70">
              {contact.email && <a href={`mailto:${contact.email}`} className="block transition-colors hover:text-primary">{contact.email}</a>}
              {contact.phoneHref && contact.phoneDisplay && <a href={contact.phoneHref} className="block transition-colors hover:text-primary">{contact.phoneDisplay}</a>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {cmsFooter.map((column) => (
            <div key={column.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-background/50">{column.title}</h3>
              <ul role="list" className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href} className="text-sm text-background/85 transition-colors hover:text-primary">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="relative border-t border-background/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-5 text-xs text-background/60 sm:flex-row lg:px-8">
          <p>&copy; {new Date().getFullYear()} {brand.namePrimary}{brand.nameAccent} {footer.copyright}</p>
          {show.social && <FooterSocialIcons info={siteInfo} size="size-8" className="gap-2 text-background" />}
        </div>
      </div>
    </footer>
  );
}

/** A single slim row. */
export function FooterMinimal({ cmsFooter, siteInfo }: Props) {
  const { footer, display } = siteInfo;
  return (
    <footer className="mt-auto border-t border-border/60 bg-background text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-6 py-6 lg:flex-row lg:px-8">
        <div className="flex flex-col items-center gap-1 lg:items-start">
          <FooterBrand info={siteInfo} markClass="size-6" nameClass="text-base" subtitle={false} tone="text-foreground" />
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} {footer.copyright}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {allLinks(cmsFooter, 6).map((link) => (
            <Link key={link.href + link.label} href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-primary">{link.label}</Link>
          ))}
        </nav>
        {display.footer.social && <FooterSocialIcons info={siteInfo} size="size-8" className="gap-2" />}
      </div>
    </footer>
  );
}
