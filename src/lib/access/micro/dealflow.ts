import type { MicroFeature } from "./types";

const P = "dealflow-ai";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all"];

/** What everybody given DealFlow gets: the dashboard (which shows only what their other features allow). */
const BASELINE = new Set(["dashboard.view"]);

const ROWS: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the DealFlow dashboard with the numbers of the areas the person can see.", "read", ["lms.VIEW_LEADS"]],
  ["leads.view", "Leads", "page", "See leads and enquiries", "Open leads, enquiries, the pipeline and a lead's details.", "read", ["lms.VIEW_LEADS"]],
  ["leads.create", "Leads", "button", "Create leads", "Add a lead by hand.", "write", ["lms.CREATE_LEADS"]],
  ["leads.edit", "Leads", "button", "Edit leads and move the pipeline", "Edit a lead, add notes and documents, move its stage, link it to a client or student.", "write", ["lms.EDIT_LEADS", "lms.canManageLeads"]],
  ["leads.delete", "Leads", "button", "Delete leads", "Delete leads and enquiries.", "write", ["lms.DELETE_LEADS"]],
  ["submissions.view", "Form submissions", "page", "See form submissions", "Open the website form submissions.", "read", ["lms.VIEW_LEADS"]],
  ["messages.view", "Messages", "page", "See the inbox", "Open the messages, e-mails and WhatsApp conversations with leads.", "read", ["lms.VIEW_LEADS"]],
  ["messages.send", "Messages", "button", "Message leads", "Send messages, e-mails and WhatsApp to leads, and use the AI draft.", "write", ["lms.MESSAGE_LEADS"]],
  ["meetings.view", "Meetings", "page", "See and join meetings", "Open meetings and their rooms.", "read", ["lms.VIEW_LEADS"]],
  ["meetings.all", "Meetings", "scope", "See and host every meeting", "Without this a person sees only the meetings they created or are invited to. With it they see and host every meeting of the company (the old manager-and-admin rule).", "read", ["lms.EXPORT_DATA", "lms.VIEW_CAREERS", "lms.MANAGE_CAMPAIGNS"], "all"],
  ["calls.view", "Voice calls", "page", "See voice calls", "Open voice calls and their details.", "read", ["lms.VIEW_LEADS"]],
  ["careers.view", "Careers", "page", "See job applications", "Open job applications and their documents.", "read", ["lms.VIEW_CAREERS"]],
  ["careers.manage", "Careers", "button", "Manage job applications", "Move applicants, schedule interviews and manage open positions.", "write", ["lms.MANAGE_CAREERS"]],
  ["campaigns.view", "Campaigns", "page", "See marketing campaigns", "Open marketing campaigns and their leads.", "read", ["lms.VIEW_ANALYTICS", "lms.canViewLmsAnalytics"]],
  ["campaigns.manage", "Campaigns", "button", "Manage marketing campaigns", "Create, import and edit marketing campaigns.", "write", ["lms.MANAGE_CAMPAIGNS", "lms.canManageCampaigns"]],
  ["chatbot.view", "Chatbot", "page", "See chatbot conversations", "Read chatbot conversations.", "read", ["lms.VIEW_CHATBOT"]],
  ["chatbot.manage", "Chatbot", "button", "Manage the chatbot", "Change the chatbot's setup and knowledge base.", "write", ["lms.MANAGE_CHATBOT"]],
  ["offers.manage", "Offers & coupons", "page", "Manage offers and coupons", "Offers, coupons, claims and subscribers (the same feature SiteCraft's Offers pages check; a SiteCraft editor holds it there).", "write", ["lms.MANAGE_OFFERS"]],
  ["wallet.manage", "Wallets & rewards", "page", "Manage wallets and rewards", "Wallets, reward rules, usage rules and referrals (the same feature SiteCraft's Wallet pages check; a SiteCraft administrator holds it there).", "write", ["lms.MANAGE_WALLET"]],
  ["data.export", "Data export", "export", "Export data", "Download exports of leads, careers, campaigns, chatbot conversations and wallet data.", "read", ["lms.EXPORT_DATA"]],
  ["portal.impersonate", "Portal", "button", "Log in as a portal user", "Sign in as a portal user to see what they see.", "write", ["lms.IMPERSONATE"]],
];

export const DEALFLOW_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
