import Link from "next/link";
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

export interface ProductSettingsLink {
  label: string;
  href: string;
  description?: string;
}

export interface ProductCard {
  key: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  settings: ProductSettingsLink[];
}

/** One plain sub-line under each category heading (the same pattern as the Integrations categories). */
export const PRODUCT_GROUP_NOTES: Record<string, string> = {
  "Human Resources & People": "People, projects and training.",
  "Finance & Procurement": "Money coming in and going out.",
  "AI & Intelligent Tools": "Assistants, analysis and testing.",
  "Sales, Marketing & CRM": "Leads, social media and search.",
  "Legal, Security & Docs": "Contracts, secure files and procedures.",
  "Website & Customer Portal": "Your website and customer support.",
};

export const PRODUCT_GROUPS: { label: string; products: ProductCard[] }[] = [
  {
    label: "Human Resources & People",
    products: [
      {
        key: "talentos",
        name: "TalentOS",
        description: "Manage employees, payroll, leave and attendance rules.",
        icon: Users,
        color: "text-blue-600 dark:text-blue-400",
        settings: [
          { label: "Organization settings", href: "/commandos/settings/products/talentos", description: "Company identity, fiscal year, payroll defaults, working days and attendance rules." },
        ],
      },
      {
        key: "sprintos",
        name: "SprintOS",
        description: "Manage projects, tasks, timesheets and teams.",
        icon: ClipboardList,
        color: "text-indigo-600 dark:text-indigo-400",
        settings: [
          { label: "Project settings", href: "/commandos/settings/products/sprintos", description: "Project categories, technology suggestions and default currency." },
        ],
      },
      {
        key: "cohort-ai",
        name: "Cohort AI",
        description: "Run training programs, batches and certificates.",
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
        description: "Keep your accounts, invoices and financial reports.",
        icon: Landmark,
        color: "text-emerald-600 dark:text-emerald-400",
        settings: [
          { label: "Accrual books", href: "/commandos/settings/products/cashflow-ai", description: "Switch to accrual accounting: receivables, payables, GST and TDS tracking." },
        ],
      },
      {
        key: "spendiq",
        name: "SpendIQ",
        description: "Control purchases, expenses, vendors and assets.",
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
        description: "Build and run AI assistants and phone agents.",
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
        description: "Ask questions about your business data.",
        icon: BarChart3,
        color: "text-cyan-600 dark:text-cyan-400",
        settings: [],
      },
      {
        key: "evaliq",
        name: "EvalIQ",
        description: "Run online tests and assessments.",
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
        description: "Track leads, deals and customers.",
        icon: Briefcase,
        color: "text-sky-600 dark:text-sky-400",
        settings: [],
      },
      {
        key: "viralpulse-ai",
        name: "ViralPulse AI",
        description: "Plan, create and publish social media posts.",
        icon: Megaphone,
        color: "text-pink-600 dark:text-pink-400",
        settings: [
          { label: "ViralPulse settings", href: "/commandos/settings/products/viralpulse-ai", description: "Brand voice, OpenAI key, integrations and social account connections." },
        ],
      },
      {
        key: "rankmax-ai",
        name: "RankMax AI",
        description: "Track your search rankings and fix SEO problems.",
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
        description: "Draft, sign and renew contracts.",
        icon: FileText,
        color: "text-slate-600 dark:text-slate-400",
        settings: [],
      },
      {
        key: "cybervault",
        name: "CyberVault",
        description: "Store sensitive documents securely.",
        icon: Vault,
        color: "text-red-600 dark:text-red-400",
        settings: [
          { label: "CyberVault settings", href: "/commandos/settings/products/cybervault", description: "Storage limits, document types and access rules." },
        ],
      },
      {
        key: "playbook-ai",
        name: "Playbook AI",
        description: "Write and share your operating procedures.",
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
        description: "Build and edit your website.",
        icon: PanelsTopLeft,
        color: "text-green-600 dark:text-green-400",
        settings: [
          { label: "CMS settings", href: "/commandos/settings/products/sitecraft-ai", description: "Global site settings, analytics tracking and AI content configuration." },
        ],
      },
      {
        key: "resolveiq",
        name: "ResolveIQ",
        description: "Answer customer questions and handle support tickets.",
        icon: ShieldCheck,
        color: "text-purple-600 dark:text-purple-400",
        settings: [],
      },
    ],
  },
];

export function SettingsLinkRow({ link }: { link: ProductSettingsLink }) {
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

