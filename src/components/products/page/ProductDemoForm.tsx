"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { SUCCESS_AUTO_HIDE_MS, useLeadSubmit } from "@/lib/useLeadSubmit";
import LeadSuccessState from "@/components/sections/LeadSuccessState";

const FIELD = "w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

/**
 * "Request Demo" — posts to the same lead pipeline as the site's other forms
 * (`/api/leads/software-development` through `useLeadSubmit`). The lead API only
 * accepts one of the category's listed services, so the demo is filed under "Web App
 * Development" and the product (and "Product demo") go in the message, which is what the sales team reads.
 */
const LEAD_CATEGORY = "software-development" as const;
const LEAD_SUB_SERVICE = "web-app-development";

export default function ProductDemoForm({
  products,
  defaultProduct,
  source,
  text,
}: {
  products: { slug: string; name: string }[];
  /** A product name pre-selected on a product's own page; empty = the whole platform. */
  defaultProduct: string;
  source: string;
  text: Record<string, string>;
}) {
  const lead = useLeadSubmit();
  const [product, setProduct] = useState(defaultProduct);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = product || text["products.demo.allProducts"];
    const ok = await lead.submit(LEAD_CATEGORY, {
      name,
      email,
      phone,
      message: `Product demo request: ${subject}${message.trim() ? `\n\n${message.trim()}` : ""}`,
      subService: LEAD_SUB_SERVICE,
      source,
    });
    if (ok) {
      setName("");
      setPhone("");
      setEmail("");
      setMessage("");
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-border/50 bg-muted/20 p-6 shadow-2xl backdrop-blur-xl sm:p-10">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <div className="relative">
        <AnimatePresence mode="wait">
          {lead.status === "success" ? (
            <LeadSuccessState key="ok" title={text["products.demo.successTitle"]} description={text["products.demo.successText"]} onDismiss={lead.reset} autoHideMs={SUCCESS_AUTO_HIDE_MS} compact />
          ) : (
            <form key="form" id="demo-form" onSubmit={onSubmit} noValidate className="space-y-5" aria-label={text["products.demo.title"]}>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
                {text["products.demo.description"]}
              </p>
              <div>
                <label htmlFor="demo-product" className="mb-1.5 block text-xs font-semibold text-muted-foreground">{text["products.demo.product"]}</label>
                <select id="demo-product" value={product} onChange={(e) => setProduct(e.target.value)} className={FIELD}>
                  <option value="">{text["products.demo.allProducts"]}</option>
                  {products.map((p) => (
                    <option key={p.slug} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="demo-name" className="mb-1.5 block text-xs font-semibold text-muted-foreground">{text["products.demo.name"]}</label>
                  <input id="demo-name" name="name" type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(lead.fieldErrors.name)} className={FIELD} />
                  {lead.fieldErrors.name && <p role="alert" className="mt-1 text-xs text-red-500">{lead.fieldErrors.name}</p>}
                </div>
                <div>
                  <label htmlFor="demo-phone" className="mb-1.5 block text-xs font-semibold text-muted-foreground">{text["products.demo.phone"]}</label>
                  <input id="demo-phone" name="phone" type="tel" required autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={Boolean(lead.fieldErrors.phone)} className={FIELD} />
                  {lead.fieldErrors.phone && <p role="alert" className="mt-1 text-xs text-red-500">{lead.fieldErrors.phone}</p>}
                </div>
              </div>
              <div>
                <label htmlFor="demo-email" className="mb-1.5 block text-xs font-semibold text-muted-foreground">{text["products.demo.email"]}</label>
                <input id="demo-email" name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(lead.fieldErrors.email)} className={FIELD} />
                {lead.fieldErrors.email && <p role="alert" className="mt-1 text-xs text-red-500">{lead.fieldErrors.email}</p>}
              </div>
              <div>
                <label htmlFor="demo-message" className="mb-1.5 block text-xs font-semibold text-muted-foreground">{text["products.demo.message"]}</label>
                <textarea id="demo-message" name="message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className={`${FIELD} resize-none`} />
              </div>
              {lead.error && <p role="alert" className="text-center text-xs text-red-500">{lead.error}</p>}
              <button
                type="submit"
                disabled={lead.status === "submitting"}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
              >
                {lead.status === "submitting" ? (
                  <>
                    {text["products.demo.sending"]}
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    {text["products.demo.submit"]}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
