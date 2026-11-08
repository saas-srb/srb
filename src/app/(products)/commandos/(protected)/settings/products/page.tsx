import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  BookText,
  BarChart3,
  Briefcase,
  Building2,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileText,
  Landmark,
  LayoutGrid,
  Megaphone,
  PanelsTopLeft,
  SearchCheck,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  Vault,
  type LucideIcon,
} from "lucide-react";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getCompanyBrand } from "@/lib/platform/branding";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Product settings",
  robots: { index: false, follow: false },
};

interface ProductSettingsLink {
  label: string;
  href: string;
  description?: string;
}

interface ProductCard {
  key: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  settings: ProductSettingsLink[];
}

const PRODUCT_GROUPS: { label: string; products: ProductCard[] }[] = [
  {
    label: "Human Resources & People",
    products: [
      {
        key: "talentos",
        name: "TalentOS",
        description: "HR management — employees, payroll, leave and attendance.",
        icon: Users,
        color: "text-blue-600 dark:text-blue-400",
        settings: [
          { label: "Organization settings", href: "/commandos/settings/products/talentos", description: "Company identity, fiscal year, payroll defaults, working days and attendance rules." },
        ],
      },
      {
        key: "sprintos",
        name: "SprintOS",
        description: "Project management — tasks, milestones, timesheets and teams.",
        icon: ClipboardList,
        color: "text-indigo-600 dark:text-indigo-400",
        settings: [
          { label: "Project settings", href: "/commandos/settings/products/sprintos", description: "Project categories, technology suggestions and default currency." },
        ],
      },
      {
        key: "cohort-ai",
        name: "Cohort AI",
        description: "Training management — programs, batches, students and certificates.",
        icon: BookText,
        color: "text-teal-600 dark:text-teal-400",
        settings: [
          { label: "Training settings", href: "/commandos/settings/products/cohort-ai", description: "Track suggestions, currency, certificate numbering and institute identity." },
        ],
      },
    ],
  },
  {
    label: "Finance & Procurement",
    products: [
      {
        key: "cashflow-ai",
        name: "CashFlow AI",
        description: "Accounting, invoicing, payroll and financial reports.",
        icon: Landmark,
        color: "text-emerald-600 dark:text-emerald-400",
        settings: [
          { label: "Accrual books", href: "/commandos/settings/products/cashflow-ai", description: "Switch to accrual accounting: receivables, payables, GST and TDS tracking." },
        ],
      },
      {
        key: "spendiq",
        name: "SpendIQ",
        description: "Procurement, expenses, vendor management and assets.",
        icon: ShoppingCart,
        color: "text-orange-600 dark:text-orange-400",
        settings: [
          { label: "Procurement settings", href: "/commandos/settings/products/spendiq", description: "Company identity for purchase orders, approval thresholds and default currency." },
        ],
      },
    ],
  },
  {
    label: "AI & Intelligent Tools",
    products: [
      {
        key: "agentos",
        name: "AgentOS",
        description: "AI chatbots — build, deploy and manage intelligent assistants.",
        icon: Bot,
        color: "text-violet-600 dark:text-violet-400",
        settings: [
          { label: "AgentOS settings", href: "/commandos/settings/products/agentos", description: "OpenAI models, cost estimates, usage limits and the Start New Chat assistant." },
          { label: "Phone & calling", href: "/commandos/settings/products/agentos/phone", description: "Phone numbers, live-call setup, calling rules and do-not-call list." },
        ],
      },
      {
        key: "databrain-ai",
        name: "DataBrain AI",
        description: "Business intelligence — dashboards, reports and analytics.",
        icon: BarChart3,
        color: "text-cyan-600 dark:text-cyan-400",
        settings: [],
      },
      {
        key: "evaliq",
        name: "EvalIQ",
        description: "Online testing — create, manage and analyse assessments.",
        icon: FileCheck2,
        color: "text-amber-600 dark:text-amber-400",
        settings: [
          { label: "EvalIQ settings", href: "/commandos/settings/products/evaliq", description: "Test limits, attempt rules and role permissions." },
        ],
      },
    ],
  },
  {
    label: "Sales, Marketing & CRM",
    products: [
      {
        key: "dealflow-ai",
        name: "DealFlow AI",
        description: "CRM, pipeline and revenue — leads, clients, deals and invoices.",
        icon: Briefcase,
        color: "text-sky-600 dark:text-sky-400",
        settings: [],
      },
      {
        key: "viralpulse-ai",
        name: "ViralPulse AI",
        description: "Social media — plan, create, schedule and analyse content.",
        icon: Megaphone,
        color: "text-pink-600 dark:text-pink-400",
        settings: [
          { label: "ViralPulse settings", href: "/commandos/settings/products/viralpulse-ai", description: "Brand voice, OpenAI key, integrations and social account connections." },
        ],
      },
      {
        key: "rankmax-ai",
        name: "RankMax AI",
        description: "SEO — keyword research, site crawls, rank tracking and reporting.",
        icon: SearchCheck,
        color: "text-lime-600 dark:text-lime-400",
        settings: [
          { label: "SEO settings", href: "/commandos/settings/products/rankmax-ai", description: "Site origin, Google Search Console, Analytics 4 and crawler settings." },
        ],
      },
    ],
  },
  {
    label: "Legal, Security & Docs",
    products: [
      {
        key: "contractflow-ai",
        name: "ContractFlow AI",
        description: "Contract lifecycle — drafting, signing, renewals and legal review.",
        icon: FileText,
        color: "text-slate-600 dark:text-slate-400",
        settings: [],
      },
      {
        key: "cybervault",
        name: "CyberVault",
        description: "Digital document locker — secure storage for employee documents.",
        icon: Vault,
        color: "text-red-600 dark:text-red-400",
        settings: [
          { label: "CyberVault settings", href: "/commandos/settings/products/cybervault", description: "Storage limits, document types and access rules." },
        ],
      },
      {
        key: "playbook-ai",
        name: "Playbook AI",
        description: "SOPs and knowledge base — create and share operating procedures.",
        icon: BookText,
        color: "text-fuchsia-600 dark:text-fuchsia-400",
        settings: [
          { label: "Playbook settings", href: "/commandos/settings/products/playbook-ai", description: "Categories, access rules and default content settings." },
        ],
      },
    ],
  },
  {
    label: "Website & Customer Portal",
    products: [
      {
        key: "sitecraft-ai",
        name: "SiteCraft AI",
        description: "CMS and website builder — pages, blog, SEO and media.",
        icon: PanelsTopLeft,
        color: "text-green-600 dark:text-green-400",
        settings: [
          { label: "CMS settings", href: "/commandos/settings/products/sitecraft-ai", description: "Global site settings, analytics tracking and AI content configuration." },
        ],
      },
      {
        key: "resolveiq",
        name: "ResolveIQ",
        description: "Help desk and support — tickets, SLA, canned responses.",
        icon: ShieldCheck,
        color: "text-purple-600 dark:text-purple-400",
        settings: [],
      },
    ],
  },
];

function SettingsLinkRow({ link }: { link: ProductSettingsLink }) {
  return (
    <Link
      href={link.href}
      className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-primary/5"
    >
      <Settings className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground group-hover:text-primary">{link.label}</p>
        {link.description && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{link.description}</p>
        )}
      </div>
      <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/0 transition-opacity group-hover:text-primary group-hover:text-muted-foreground" />
    </Link>
  );
}

function NoSettings() {
  return (
    <p className="px-3 py-2 text-xs text-muted-foreground italic">
      This product is configured from within its own settings page.
    </p>
  );
}

export default async function AllProductSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");

  const brand = await getCompanyBrand();

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-8">
        <PanelPageHeader
          breadcrumbs={[{ label: "Settings", href: "/commandos/settings" }, { label: "Product settings" }]}
          title={<>All product settings</>}
          description={
            <>
              Configure every product your company uses from one place. Only Directors see this.
            </>
          }
        />

        {PRODUCT_GROUPS.map((group) => (
          <section key={group.label} className="space-y-3">
            {/* Group heading */}
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {group.label}
              </h2>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            {/* Product cards grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.products.map((product) => {
                const Icon = product.icon;
                const hasSettings = product.settings.length > 0;
                return (
                  <GlassCard key={product.key} interactive={false} className={cn(!hasSettings && "opacity-70")}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted", product.color)}>
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <div>
                            <CardTitle className="text-sm font-semibold">{product.name}</CardTitle>
                          </div>
                        </div>
                        {!hasSettings && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            No standalone settings
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs mt-1 leading-relaxed">
                        {product.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {hasSettings ? (
                        <div className="divide-y divide-border/40">
                          {product.settings.map((link) => (
                            <SettingsLinkRow key={link.href} link={link} />
                          ))}
                        </div>
                      ) : (
                        <NoSettings />
                      )}
                    </CardContent>
                  </GlassCard>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
