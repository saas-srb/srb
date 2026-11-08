/**
 * What the same jobs cost with separate tools. Every row is a price read from the vendor's own public pricing page (the URL and the date
 * are kept with it); nothing is estimated. Prices are per seat per month on yearly billing, before tax. Vendors change prices, so re-read
 * the pages and bump `COMPARE_AS_OF` before editing a number.
 */
export const COMPARE_AS_OF = "14 Oct 2026";
/** Rupees per US dollar used to show dollar prices in rupees (approximate; shown on the page). */
export const COMPARE_USD_INR = 96.5;
export const COMPARE_TEAM = 10;

export interface CompareRow {
  job: string;
  /** SelfRun product that does the same job. */
  panel: string;
  vendor: string;
  product: string;
  /** Price per seat per month, in the vendor's currency. For per-organisation prices, `perOrg` is true and `seatsIncluded` says how many people it covers. */
  price: number;
  currency: "USD" | "INR";
  perOrg?: boolean;
  /** A fixed count (e.g. channels) the price is per, instead of the team size. */
  units?: number;
  seatsIncluded?: number;
  source: string;
  note?: string;
}

export const COMPARE_ROWS: CompareRow[] = [
  { job: "Team chat & calls", panel: "SelfRun Huddle AI", vendor: "Slack", product: "Pro", price: 245.25, currency: "INR", source: "https://slack.com/pricing", note: "per person, billed yearly" },
  { job: "HR & payroll", panel: "SelfRun TalentOS", vendor: "greytHR", product: "Essential", price: 2495, currency: "INR", perOrg: true, source: "https://www.greythr.com/pricing/", note: "per company, billed monthly, up to 50 employees" },
  { job: "Sales & CRM", panel: "SelfRun DealFlow AI", vendor: "monday.com", product: "monday CRM · Basic", price: 12, currency: "USD", source: "https://monday.com/pricing", note: "per seat, billed yearly (3-seat minimum)" },
  { job: "Projects & tasks", panel: "SelfRun SprintOS", vendor: "monday.com", product: "work management · Basic", price: 9, currency: "USD", source: "https://monday.com/pricing", note: "per seat, billed yearly (3-seat minimum)" },
  { job: "Accounting & invoicing", panel: "SelfRun CashFlow AI", vendor: "Zoho", product: "Books · Premium", price: 2999, currency: "INR", perOrg: true, source: "https://www.zoho.com/in/books/pricing/", note: "per company, billed yearly, 10 users included" },
  { job: "Purchasing & inventory", panel: "SelfRun SpendIQ", vendor: "Zoho", product: "Inventory · Plus", price: 4999, currency: "INR", perOrg: true, source: "https://www.zoho.com/in/inventory/pricing/", note: "per company, billed yearly, 10 users included" },
  { job: "Training courses", panel: "SelfRun Cohort AI", vendor: "Thinkific", product: "Basic", price: 40, currency: "USD", perOrg: true, source: "https://www.thinkific.com/pricing/", note: "per school, billed yearly" },
  { job: "Online tests", panel: "SelfRun EvalIQ", vendor: "TestGorilla", product: "Assessments · Core (from)", price: 215, currency: "USD", perOrg: true, source: "https://www.testgorilla.com/pricing/", note: "per account, billed yearly" },
  { job: "Company website", panel: "SelfRun SiteCraft AI", vendor: "Wix", product: "Light", price: 17.77, currency: "USD", perOrg: true, source: "https://www.wix.com/premium-purchase-plan/dynamo", note: "per website, billed yearly" },
  { job: "SEO audits & tracking", panel: "SelfRun RankMax AI", vendor: "Semrush", product: "SEO plan", price: 117.33, currency: "USD", perOrg: true, source: "https://www.semrush.com/prices/", note: "per account, billed yearly" },
  { job: "Social media posting", panel: "SelfRun ViralPulse AI", vendor: "Buffer", product: "Essentials · 5 channels", price: 5, currency: "USD", units: 5, source: "https://buffer.com/pricing", note: "$5 per channel, monthly billing" },
  { job: "AI chatbot for customers", panel: "SelfRun AgentOS", vendor: "Chatbase", product: "Standard", price: 120, currency: "USD", perOrg: true, source: "https://www.chatbase.co/pricing", note: "per account, billed yearly, 4,000 messages" },
  { job: "AI assistant for the team", panel: "SelfRun DataBrain AI", vendor: "OpenAI", product: "ChatGPT Business · Standard", price: 20, currency: "USD", source: "https://openai.com/business/pricing/", note: "per person, billed yearly (2-seat minimum)" },
  { job: "Secure document storage", panel: "SelfRun CyberVault", vendor: "Dropbox", product: "Business · Standard", price: 15, currency: "USD", source: "https://www.dropbox.com/business/plans-comparison", note: "per person" },
  { job: "SOPs & policy wiki", panel: "SelfRun Playbook AI", vendor: "Notion", product: "Plus", price: 10, currency: "USD", source: "https://www.notion.com/pricing", note: "per person" },
  { job: "Customer help desk & portal", panel: "SelfRun ClientOS", vendor: "Zoho", product: "Desk · Express · 3 agents", price: 420, currency: "INR", units: 3, source: "https://www.zoho.com/desk/pricing.html", note: "per agent, billed yearly, 3 agents" },
];

/** Products whose job has no public price to compare (the vendor says "contact sales" or the page could not be read). They are listed, never priced. */
export const COMPARE_UNPRICED = ["SelfRun ContractFlow AI", "SelfRun ResolveIQ"];

export interface CompareResult { rows: (CompareRow & { monthlyInr: number })[]; totalInr: number }

export function compareStack(team: number = COMPARE_TEAM): CompareResult {
  const rows = COMPARE_ROWS.map((r) => {
    const base = r.perOrg ? r.price : r.price * (r.units ?? Math.max(team, 3));
    return { ...r, monthlyInr: Math.round(r.currency === "USD" ? base * COMPARE_USD_INR : base) };
  });
  return { rows, totalInr: rows.reduce((n, r) => n + r.monthlyInr, 0) };
}
