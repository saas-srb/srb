/**
 * One short line per product, shown under its name in the products sidebar and lists. Each is a plain restatement of the product's own
 * headline and summary in `content.ts`: nothing is added.
 */
export const PRODUCT_SHORT: Record<string, string> = {
  workspace: "The home of your business: people, plans, setup and automations",
  hrms: "Hiring, attendance, leave and payroll, with one record for each person",
  pms: "Projects, tasks, timesheets and costing delivered on time",
  lms: "Leads and deals, so no enquiry slips through",
  fms: "Invoices, payments, banking and accounting you can trust",
  prms: "Purchase requests, orders, suppliers and assets under control",
  tms: "Training programs, batches, students and certificates",
  messenger: "Team chat, announcements, meetings and calls next to the work",
  sop: "Procedures and policies you can assign, and check that people have read",
  lpms: "A register of agreements with status, dates and approval history",
  dlms: "A secure place for passwords, files and client documents",
  ots: "Timed online tests with automatic evaluation and certificates",
  aibots: "AI assistants trained on your own knowledge",
  intelligence: "Ask your business anything and get answers from your records",
  smms: "Social campaigns and posts, planned, created and published with AI",
  seo: "Audits, keywords, rankings and backlinks, with what to fix next",
  cms: "Your website, blog, forms and themes, fully in your control",
  portal: "A page of their own for customers, students and applicants",
  support: "AI-first help, a help center and a request desk",
  website: "Your public website on your own web address, with a secure connection",
};

export const productShort = (key: string, fallback = ""): string => PRODUCT_SHORT[key] ?? fallback;
