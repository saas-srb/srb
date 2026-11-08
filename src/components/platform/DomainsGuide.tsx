"use client";

import { Check, CheckCircle2, Circle, Globe, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompanyDomainView } from "@/lib/platform/domains/types";

/**
 * The step-by-step guide on Settings → Domains for connecting a company's own domain. It follows the company's real progress:
 * each step shows done / current / to do from the domains list, and the examples use the company's own domain once it added one.
 */
export default function DomainsGuide({ domains }: { domains: CompanyDomainView[] }) {
  const custom = domains.filter((d) => d.kind === "custom");
  const first = custom[0];
  const example = first ? first.host : "www.yourcompany.com";
  const root = example.replace(/^www\./, "");
  const appHost = `app.${root}`;

  const added = custom.length > 0;
  const verified = custom.some((d) => d.status === "verified");
  const live = custom.some((d) => d.status === "verified" && d.hosting.ssl === "active");
  const primary = custom.some((d) => d.isPrimary);
  const flags = [added, verified, verified, live, primary];
  const current = flags.findIndex((f) => !f);

  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "Add your domain below",
      body: (
        <>
          Type the address you want for your website into <strong>Add a domain</strong> and press <em>Add domain</em>. Use <code className="rounded bg-muted px-1">{example}</code> (with <code className="rounded bg-muted px-1">www</code>). Write only the domain: no <code className="rounded bg-muted px-1">https://</code>, no slashes. You do <strong>not</strong> add the <code className="rounded bg-muted px-1">app.</code> address; it is created for you.
        </>
      ),
    },
    {
      title: "Add the DNS records at your domain provider",
      body: (
        <>
          <p>After you add the domain, a list of DNS records appears under it, each with a <em>Copy</em> button. Sign in where you bought the domain (GoDaddy, Namecheap, Cloudflare, Google Domains, Route 53, BigRock…), open <strong>DNS settings</strong> and create every record exactly as listed:</p>
          <div className="mt-2 overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2 font-medium">What it does</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Name / Host</th><th className="px-3 py-2 font-medium">Value</th></tr></thead>
              <tbody className="divide-y">
                <tr><td className="px-3 py-2">Proves you own the domain</td><td className="px-3 py-2 font-mono">TXT</td><td className="px-3 py-2 font-mono">_domain-verify.{example}</td><td className="px-3 py-2">shown in the list</td></tr>
                <tr><td className="px-3 py-2">Shows your website at <strong>{example}</strong></td><td className="px-3 py-2 font-mono">CNAME</td><td className="px-3 py-2 font-mono">{example.startsWith("www.") ? "www" : example}</td><td className="px-3 py-2">shown in the list</td></tr>
                <tr><td className="px-3 py-2">Shows your products at <strong>{appHost}</strong></td><td className="px-3 py-2 font-mono">CNAME</td><td className="px-3 py-2 font-mono">app</td><td className="px-3 py-2">shown in the list</td></tr>
                <tr><td className="px-3 py-2">Lets the hosting provider serve <strong>{appHost}</strong> (shown only when it asks for it)</td><td className="px-3 py-2 font-mono">TXT</td><td className="px-3 py-2 font-mono">_vercel</td><td className="px-3 py-2">shown in the list</td></tr>
              </tbody>
            </table>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>In the <em>Name / Host</em> box most providers want only the first part (<code className="rounded bg-muted px-1">www</code>, <code className="rounded bg-muted px-1">app</code>, <code className="rounded bg-muted px-1">_domain-verify.www</code>), not the whole domain. The provider adds the rest.</li>
            <li>If a record with the same name already exists (an old <code className="rounded bg-muted px-1">www</code> or <code className="rounded bg-muted px-1">app</code> record), replace it. Leave your email records (MX, SPF, DKIM) alone.</li>
            <li>Cloudflare: set the orange cloud to <strong>DNS only</strong> (grey) for these records until the domain is verified.</li>
            <li>Do <strong>not</strong> change your domain&apos;s nameservers.</li>
            <li>Publish <strong>every</strong> record in the list, including the ones for <code className="rounded bg-muted px-1">{appHost}</code>, in one go. Nothing has to be done in the hosting dashboard: after the records are in, <em>Check now</em> (and the daily automatic check) verifies everything, including the app address, by itself.</li>
          </ul>
        </>
      ),
    },
    {
      title: "Press “Check now”",
      body: <>DNS changes usually show up within minutes, sometimes up to a few hours. Press <strong>Check now</strong> under your domain. Each record turns <span className="text-emerald-600">Found</span> when it is in place, and the domain becomes <strong>Verified</strong>. We also re-check by ourselves every day, so you can leave and come back.</>,
    },
    {
      title: "Wait for the SSL lock",
      body: <>Once verified, a secure certificate (the padlock, <code className="rounded bg-muted px-1">https</code>) is issued automatically. The badge changes from <em>SSL waiting for DNS</em> to <strong>SSL active</strong>, usually within a few minutes.</>,
    },
    {
      title: "Make it your primary address",
      body: <>Press <strong>Make primary</strong>. Your website links, sitemap, emails and certificates will then use it. Your original workspace address keeps working too.</>,
    },
  ];

  const open = !(verified && primary);
  return (
    <details open={open} className="group rounded-xl border bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <Globe className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">How to connect your own domain</span>
          <span className="block text-xs text-muted-foreground">{primary ? "Your domain is connected. This guide is here if you need it." : "Five short steps. This list follows your progress."}</span>
        </span>
        <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
        <span className="hidden text-xs text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <div className="space-y-5 border-t p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border bg-background/60 p-3"><Globe className="mt-0.5 size-4 shrink-0 text-primary" /><p className="text-sm"><strong className="break-all">https://{example}</strong><span className="block text-xs text-muted-foreground">Your public website</span></p></div>
          <div className="flex items-start gap-3 rounded-lg border bg-background/60 p-3"><LayoutDashboard className="mt-0.5 size-4 shrink-0 text-primary" /><p className="text-sm"><strong className="break-all">https://{appHost}</strong><span className="block text-xs text-muted-foreground">Your workspace and products, where your team signs in. Created automatically.</span></p></div>
        </div>

        <ol className="space-y-4">
          {steps.map((s, i) => {
            const done = flags[i];
            const isCurrent = i === current;
            return (
              <li key={s.title} className="flex gap-3">
                <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", done ? "border-emerald-500 bg-emerald-500 text-white" : isCurrent ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className={cn("font-medium", isCurrent && "text-primary")}>{s.title}{done ? <span className="ml-2 text-xs font-normal text-emerald-600">Done</span> : isCurrent ? <span className="ml-2 text-xs font-normal">Next</span> : null}</p>
                  <div className="text-muted-foreground">{s.body}</div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="space-y-2 rounded-lg border bg-background/60 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4 text-emerald-600" /> Before you start</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>You need access to the domain&apos;s DNS settings (your domain provider, or whoever manages it for you).</li>
            <li>If <code className="rounded bg-muted px-1">{root}</code> already shows another website, that site stops showing as soon as the new records are live, and visitors see this one instead. Do this at a quiet time.</li>
            <li>The plain <code className="rounded bg-muted px-1">{root}</code> (without www) works too once you connect <code className="rounded bg-muted px-1">{example}</code>. For the cleanest result, set your provider to forward <code className="rounded bg-muted px-1">{root}</code> to <code className="rounded bg-muted px-1">{example}</code>, or add the A record shown in the list.</li>
            <li>One domain can belong to one workspace only. If it says the domain is already in use, it is connected to another workspace.</li>
          </ul>
        </div>

        <div className="space-y-2 text-sm">
          <p className="font-medium">If something doesn&apos;t work</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li><strong className="text-foreground">&ldquo;Not found yet&rdquo;</strong>: the record isn&apos;t visible yet. Wait 10 to 30 minutes and press Check now. Check the Name box (see the tips in step 2).</li>
            <li><strong className="text-foreground">&ldquo;Wrong value&rdquo;</strong>: the record exists with a different value. Edit it to match the one in the list, with no extra spaces or quotes.</li>
            <li><strong className="text-foreground">&ldquo;SSL waiting for DNS&rdquo;</strong>: the website and <code className="rounded bg-muted px-1">app</code> CNAME records aren&apos;t pointing here yet, or an orange-cloud proxy is on. Fix the record and press Check now.</li>
            <li><strong className="text-foreground">The address shows &ldquo;No workspace here&rdquo;</strong>: the domain isn&apos;t verified yet, or it was removed. Verify it first.</li>
          </ul>
        </div>
      </div>
    </details>
  );
}
