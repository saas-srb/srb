import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/SocialIcons";
import { FooterBrand, FooterContactLines, FooterSocialIcons, FooterCopyright, FooterLegalLinks, socialLinks } from "@/components/footer/FooterParts";
import type { SiteInfo } from "@/lib/products/sitecraft-ai/site-info-shared";
import type { PublicFooterColumn } from "@/lib/products/sitecraft-ai/footer";

export default function Footer({ cmsFooter, siteInfo }: { cmsFooter: PublicFooterColumn[]; siteInfo: SiteInfo }) {
  const { contact, footer, display } = siteInfo;
  const show = display.footer;
  const showCtaBand = show.ctaBand && !!footer.ctaTitle;
  const showWhatsApp = show.whatsappButton && !!contact.whatsappHref && !!footer.whatsappLabel;
  const showBottomBar = show.bottomBar;
  const footerColumns = cmsFooter;
  return (
    <footer className="relative bg-secondary dark:bg-card text-secondary-foreground border-t border-border mt-auto overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 w-[500px] h-[400px] bg-secondary/10 rounded-full blur-[150px] pointer-events-none"></div>

      {/* CTA strip */}
      {showCtaBand && (
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8 pt-16 sm:pt-20 group/cta">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-primary/20 via-primary/0 to-secondary/20 opacity-0 group-hover/cta:opacity-100 blur-xl transition-opacity duration-500 pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6 rounded-3xl bg-background/10 border border-secondary-foreground/15 dark:border-white/10 backdrop-blur-sm px-8 py-10 sm:px-12 transition-all duration-300 group-hover/cta:border-primary/30 group-hover/cta:-translate-y-1">
          <div className="text-center sm:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary mb-4">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              {footer.badge}
            </span>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight">{footer.ctaTitle}</h3>
            <p className="text-sm sm:text-base text-secondary-foreground/85 mt-2">{footer.ctaText}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 flex-shrink-0">
            <Link
              href={footer.ctaHref}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/30"
            >
              {footer.ctaLabel} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            {showWhatsApp && (
            <a
              href={contact.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-7 py-3.5 text-sm font-bold text-background hover:scale-105 active:scale-95 transition-all shadow-lg shadow-foreground/10"
            >
              <WhatsAppIcon className="w-4 h-4" />
              {footer.whatsappLabel}
            </a>
            )}
          </div>
        </div>
      </div>
      )}

      <div className={`relative mx-auto max-w-7xl px-6 pb-8 lg:px-8 ${showCtaBand ? "pt-16 sm:pt-20" : "pt-14"}`}>
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          <div className="space-y-6 xl:col-span-1">
            <FooterBrand info={siteInfo} />
            {show.about && footer.about && (
              <p className="text-sm leading-6 text-secondary-foreground/85 max-w-xs">
                {footer.about}
              </p>
            )}

            {show.contact && <FooterContactLines info={siteInfo} />}

            {show.social && socialLinks(siteInfo).length > 0 && (
              <div>
                {footer.followLabel && <p className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground/85 mb-3">{footer.followLabel}</p>}
                <FooterSocialIcons info={siteInfo} />
              </div>
            )}
          </div>
          <div className="mt-16 grid grid-cols-2 gap-8 lg:grid-cols-4 xl:col-span-2 xl:mt-0">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h3 className="flex items-center gap-2 text-sm font-semibold leading-6 uppercase tracking-wider text-[color-mix(in_srgb,var(--primary)_72%,black)] dark:text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-primary to-secondary" />
                  {column.title}
                </h3>
                <ul role="list" className="mt-6 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        href={link.href}
                        className={
                          link.emphasized
                            ? "inline-block text-sm leading-6 text-primary font-semibold hover:translate-x-1 transition-all duration-200"
                            : "inline-block text-sm leading-6 text-secondary-foreground/80 hover:text-primary hover:translate-x-1 transition-all duration-200"
                        }
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  {column.viewAllHref && (
                    <li className="pt-1">
                      <Link href={column.viewAllHref} className="group inline-flex items-center gap-1.5 text-sm font-semibold leading-6 text-secondary-foreground hover:text-primary transition-colors">
                        {column.viewAllLabel || `View All ${column.title}`}
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
        {showBottomBar && (
          <div className="mt-16 border-t border-secondary-foreground/10 dark:border-white/10 sm:mt-20 lg:mt-24">
            <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl bg-white/40 px-4 py-4 dark:bg-white/5 sm:flex-row sm:px-6">
              <FooterCopyright info={siteInfo} />
              <FooterLegalLinks info={siteInfo} className="justify-center" />
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
