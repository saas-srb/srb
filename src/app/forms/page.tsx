import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import FormFrame from "./FormFrame";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { hiddenProducts } from "@/lib/platform/products/visible";
import { hrefAvailable } from "@/lib/platform/products/routes";

export const metadata: Metadata = { title: "Get in touch", robots: { index: false, follow: false } };

const LINKS = [
  { href: "/forms/enquiry", label: "Send an enquiry", text: "Ask about our products and services." },
  { href: "/forms/careers", label: "Apply for a job", text: "See open roles and send your resume." },
  { href: "/clientos", label: "Sign in to the portal", text: "For our clients, students and candidates." },
];

export default async function FormsHome() {
  if (!(await currentCompanyIdOrNull())) notFound();
  const hidden = await hiddenProducts();
  const links = LINKS.filter((l) => hrefAvailable(l.href, hidden));
  return (
    <FormFrame title="Get in touch" description="Choose what you came to do.">
      {links.length === 0 ? (
        <p className="rounded-2xl border border-border/60 p-4 text-sm text-muted-foreground">There is nothing to do on this page yet.</p>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="block rounded-2xl border border-border/60 p-4 hover:border-primary/50 hover:bg-primary/5">
                <span className="block font-semibold text-foreground">{l.label}</span>
                <span className="block text-sm text-muted-foreground">{l.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </FormFrame>
  );
}
