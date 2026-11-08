import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { socialIconFor } from "@/components/icons/social-icon-for";
import { socialLinks } from "@/components/footer/FooterParts";
import type { SiteInfo } from "@/lib/products/sitecraft-ai/site-info-shared";
import type { PublicFooterColumn } from "@/lib/products/sitecraft-ai/footer";
import SiteLogo from "@/components/SiteLogo";

/**
 * "Compact" footer variant, selectable per theme in the CMS
 * (src/lib/sitecraft-ai/component-variants.ts). Same content sources as the default
 * `Footer` — the CMS footer columns (or their code-defined defaults) and
 * CMS Site Identity (brand, contact details) — in a different structure: no CTA band, one dense
 * row of link groups, a slim bottom bar.
 */
export default function FooterCompact({ cmsFooter, siteInfo }: { cmsFooter: PublicFooterColumn[]; siteInfo: SiteInfo }) {
  const { brand, contact, footer, display } = siteInfo;
  const social = display.footer.social ? socialLinks(siteInfo) : [];
  const hasPhone = !!contact.phoneHref && !!contact.phoneDisplay;
  const columns = cmsFooter;

  return (
    <footer className="mt-auto border-t border-border/60 bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="max-w-xs space-y-4">
            <Link href="/" className="flex w-fit items-center gap-2">
              <SiteLogo logoUrl={brand.logoUrl} logoDarkUrl={brand.logoDarkUrl} className="size-7" />
              <span className="text-lg font-extrabold tracking-tight">
                {brand.namePrimary}<span className="text-primary">{brand.nameAccent}</span>
              </span>
            </Link>
            {display.footer.contact && (contact.email || hasPhone) && (
              <div className="space-y-2 text-sm text-muted-foreground">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-primary">
                    <Mail className="size-4" aria-hidden="true" /> {contact.email}
                  </a>
                )}
                {hasPhone && (
                  <a href={contact.phoneHref} className="flex items-center gap-2 hover:text-primary">
                    <Phone className="size-4" aria-hidden="true" /> {contact.phoneDisplay}
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-4 lg:max-w-3xl">
            {columns.map((column) => (
              <div key={column.title}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{column.title}</h3>
                <ul role="list" className="mt-3 space-y-2">
                  {column.links.slice(0, 6).map((link) => (
                    <li key={link.href + link.label}>
                      <Link href={link.href} className={`text-sm hover:text-primary ${link.emphasized ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  {column.viewAllHref && (
                    <li>
                      <Link href={column.viewAllHref} className="text-sm font-semibold text-foreground hover:text-primary">
                        {column.viewAllLabel || `View all ${column.title}`}
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} {brand.namePrimary}{brand.nameAccent} {footer.copyright || brand.subtitle}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {footer.compactLinks.map((link) => (
              <Link key={link.href + link.label} href={link.href} className="hover:text-primary">{link.label}</Link>
            ))}
            {social.map((link) => {
              const Icon = socialIconFor(link.name);
              return (
                <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                  <span className="sr-only">{link.name}</span>
                  <Icon className="size-4" />
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}
