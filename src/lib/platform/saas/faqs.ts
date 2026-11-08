import { AI_SUPPORT_COLLABORATION_FAQS } from "@/lib/platform/saas/faqs/products/ai-support-collaboration";
import { BUSINESS_WORKFLOWS_FAQS } from "@/lib/platform/saas/faqs/products/business-workflows";
import { OPERATIONS_PEOPLE_FAQS } from "@/lib/platform/saas/faqs/products/operations-people";
import { PEOPLE_TRAINING_SECURITY_FAQS } from "@/lib/platform/saas/faqs/products/people-training-security";
import { PLATFORM_CONTENT_FAQS } from "@/lib/platform/saas/faqs/products/platform-content";
import { selfRunProductName } from "@/lib/platform/saas/product-routes";

export interface FaqHubItem {
  q: string;
  a: string;
  evidence?: string[];
}

export interface FaqHubGroup {
  id: string;
  title: string;
  href?: string;
  items: FaqHubItem[];
}

const general: FaqHubGroup = {
  id: "general",
  title: "General system FAQs",
  items: [
    {
      q: "What is SelfRun AI?",
      a: "SelfRun AI is a suite of independent business products for sales, people, finance, projects, purchasing, training, documents, websites, collaboration and support. CommandOS provides a shared company control center, and configured workflows connect specific records and actions across products.",
    },
    {
      q: "Do I have to use every product?",
      a: "No. Products are designed to work independently, so a company can start with the products it needs and add others later. Access to products and their screens still depends on the company’s configuration and each user’s permissions.",
    },
    {
      q: "How is access to business data controlled?",
      a: "CommandOS provides roles and fine-grained permissions for product areas and actions. Product access is checked against the signed-in user, and activity is recorded in audit tools; the exact screens available depend on the permissions assigned to that user.",
    },
    {
      q: "Can one company access another company’s records?",
      a: "No. Company data is scoped to its owning company in the data layer, so a company’s users cannot query another company’s records through the product.",
    },
    {
      q: "Can workflows connect actions in different products?",
      a: "Workflows use triggers, optional conditions and actions. Implemented examples include creating a SprintOS client record when a DealFlow AI deal is won and posting payroll results from TalentOS to CashFlow AI; available actions depend on the configured workflow.",
    },
    {
      q: "Can AI read or change company records?",
      a: "DataBrain AI answers questions from the current user’s permitted business data with read-only queries. Other AI features have their own product-specific behavior and permissions, so the DataBrain read-only rule should not be assumed to describe every assistant or generator.",
    },
    {
      q: "Can I bring existing data into SelfRun?",
      a: "The platform includes CSV imports for supported record types such as leads, clients and employees. Importers validate supported fields and report rows that need correction; available import types vary by product.",
    },
    {
      q: "Where can users get product help?",
      a: "ResolveIQ includes a searchable help center, an assistant that searches published help content, and support requests with status tracking. Users can also contact the SelfRun team through the website contact page.",
    },
    {
      q: "Can I use my own domain for my website?",
      a: "Yes. The domain setup flow asks you to add the DNS records shown for your domain, then verify the configuration; the platform provisions SSL automatically after verification.",
    },
    {
      q: "Can AgentOS assistants be configured for different jobs?",
      a: "Yes. Each AgentOS bot can have its own instructions, model, knowledge files and access rules.",
      evidence: ["src/lib/products/agentos/bots.ts:15-18", "src/components/products/agentos/BotForm.tsx:174-203"],
    },
    {
      q: "What information is needed to create an AgentOS bot?",
      a: "A bot requires a name and system instructions, and its form lets an administrator choose an allowed model and configure other options such as prompts, attachments and access.",
      evidence: ["src/components/products/agentos/BotForm.tsx:120-132", "src/components/products/agentos/BotForm.tsx:174-229", "src/lib/products/agentos/bots.ts:194-207"],
    },
    {
      q: "Can DataBrain AI update the records it analyzes?",
      a: "No. DataBrain AI uses read-only queries and has no write path to change those business records.",
      evidence: ["src/lib/products/databrain-ai/query/execute.ts:11-14", "src/lib/products/databrain-ai/query/execute.ts:75-76"],
    },
    {
      q: "Does DataBrain AI show the same data to every employee?",
      a: "No. Its available data is filtered by company entitlements, enabled products and the signed-in user's data permissions.",
      evidence: ["src/lib/products/databrain-ai/catalog/view.ts:9-16", "src/lib/products/databrain-ai/catalog/view.ts:58-74"],
    },
    {
      q: "What kind of questions can I ask DataBrain AI?",
      a: "You can ask in plain language about company business records available to your account.",
      evidence: ["src/app/(products)/databrain-ai/(protected)/page.tsx:9-18"],
    },
    {
      q: "Where can users search for product help?",
      a: "ResolveIQ's Help Center lets users browse published guides and FAQs or search by topic, feature or error.",
      evidence: ["src/app/(products)/resolveiq/(protected)/help/page.tsx:9-25"],
    },
    {
      q: "Does the ResolveIQ Help Center expose draft articles?",
      a: "No. The customer Help Center lists published articles only.",
      evidence: ["src/lib/support/articles.ts:49-55", "src/lib/support/articles.ts:58-60"],
    },
    {
      q: "What communication spaces does Huddle AI provide?",
      a: "Huddle AI supports team and project channels, direct messages and named groups.",
      evidence: ["src/lib/products/huddle-ai/channels.ts:8-18", "src/components/products/huddle-ai/types.ts:1-3"],
    },
    {
      q: "Can a user join a public Huddle AI team channel?",
      a: "Yes. Public team channels can be browsed and self-joined by Huddle users.",
      evidence: ["src/lib/products/huddle-ai/channels.ts:14-18", "src/app/(products)/huddle-ai/(protected)/channels/actions.ts:49-62"],
    },
    {
      q: "How does CashFlow AI link an invoice to a customer?",
      a: "An invoice selects an existing SprintOS client as its customer rather than creating a separate finance customer record, and keeps a customer-name snapshot on the invoice.",
      evidence: ["src/lib/products/cashflow-ai/invoices.ts:30-45", "src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:57-81"],
    },
    {
      q: "Can CashFlow AI invoices be associated with projects?",
      a: "Yes. An invoice can retain a project reference alongside its client.",
      evidence: ["src/lib/products/cashflow-ai/invoices.ts:36-45", "src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:75-81"],
    },
    {
      q: "Can employees submit purchase requests in SpendIQ?",
      a: "Yes. Employees can create requisitions for themselves and submit them into an approval flow that notifies procurement approvers.",
      evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:45-123"],
    },
    {
      q: "Can SpendIQ approvers explain a requisition decision?",
      a: "Authorized approvers can approve or reject a requisition with a decision note, and the requester is notified.",
      evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:125-176"],
    },
    {
      q: "What happens after a SpendIQ requisition is submitted?",
      a: "Submission moves the requisition into its approval flow and notifies procurement approvers.",
      evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:92-123"],
    },
    {
      q: "What work can teams manage in SprintOS?",
      a: "SprintOS covers clients, projects, milestones, tasks, timesheets, shared documents, activity and project costing.",
      evidence: ["docs/products.md:81-88"],
    },
    {
      q: "Can a SprintOS project have a project manager?",
      a: "Yes. Project records store a project-manager ID, and the project form loads employee options for manager selection.",
      evidence: ["src/app/(products)/sprintos/(protected)/projects/actions.ts:77-93", "src/app/(products)/sprintos/(protected)/projects/page.tsx:13-33"],
    },
    {
      q: "Can ContractFlow AI document types have their own fields?",
      a: "Yes. Each maker type can define a field schema with keys, labels, field types, options, required flags and optional defaults.",
      evidence: ["src/lib/products/contractflow-ai/types.ts:5-13", "src/lib/products/contractflow-ai/types.ts:41-60"],
    },
    {
      q: "What kinds of documents can ContractFlow AI manage?",
      a: "Configurable document-maker types can cover records such as NDAs, service agreements, privacy documents and internal policies.",
      evidence: ["docs/products.md:153-164", "src/lib/products/contractflow-ai/types.ts:41-60"],
    },
    {
      q: "What determines which products appear in CommandOS?",
      a: "CommandOS builds a user's product and analytics panels from that user's allowed navigation.",
      evidence: ["src/app/(products)/commandos/(protected)/page.tsx:29-44", "src/app/(products)/commandos/(protected)/page.tsx:57-58"],
    },
    {
      q: "Can CommandOS users administer company accounts?",
      a: "CommandOS includes centralized user administration for the company roster across products.",
      evidence: ["src/app/(products)/commandos/(protected)/users/page.tsx:61-66"],
    },
    {
      q: "Can CommandOS administrators create custom roles?",
      a: "Yes. A Director can define custom roles that combine product access with specific permissions.",
      evidence: ["src/app/(products)/commandos/(protected)/roles/page.tsx:11-21"],
    },
    {
      q: "Are ClientOS accounts the same as staff accounts?",
      a: "No. ClientOS portal identities are stored separately from internal staff-user identities.",
      evidence: ["src/lib/portal-roles.ts:2-7", "docs/products.md:287-290"],
    },
    {
      q: "Which portal roles does ClientOS support?",
      a: "The portal role model includes job applicant, intern, trainee and client roles.",
      evidence: ["src/lib/portal-roles.ts:12-15"],
    },
    {
      q: "Can ClientOS show different pages to different portal users?",
      a: "Yes. ClientOS is a self-service portal with role-specific screens for clients, businesses, students, interns and job applicants.",
      evidence: ["docs/products.md:285-294", "src/lib/portal-roles.ts:2-12"],
    },
    {
      q: "Can DealFlow AI track enquiries from first contact?",
      a: "Yes. Its documented lead workflow tracks website enquiries from first contact through to close.",
      evidence: ["docs/products.md:130-136"],
    },
    {
      q: "Does every DealFlow AI lead type use the same stages?",
      a: "No. Lead stages are workflow-specific by lead type, so different kinds of records can follow different stage paths.",
      evidence: ["src/lib/lead-management/workflows.ts:1-7", "src/lib/lead-management/workflows.ts:66-78"],
    },
    {
      q: "Which sales and recruitment areas are included in DealFlow AI?",
      a: "The product covers leads and clients, a pipeline and timelines, messages, campaign analytics, career applicants, offers and coupons, wallet credits, and website chat and voice assistants.",
      evidence: ["docs/products.md:128-137"],
    },
    {
      q: "What people operations are covered by TalentOS?",
      a: "TalentOS covers employee records, company structure, attendance, leave, payroll with payslips and payouts, and recruitment that can lead to employee onboarding.",
      evidence: ["docs/products.md:68-77"],
    },
    {
      q: "Can employees use TalentOS to review workforce information?",
      a: "Yes. The employee self-service area includes a directory of the active workforce.",
      evidence: ["src/app/(products)/talentos/(protected)/me/directory/page.tsx:8-26"],
    },
    {
      q: "Can HR filter employees in TalentOS?",
      a: "Yes. The staff directory supports search and filters such as department and designation.",
      evidence: ["src/app/(products)/talentos/(protected)/(staff)/employees/page.tsx:18-53", "src/app/(products)/talentos/(protected)/(staff)/employees/page.tsx:83-88"],
    },
    {
      q: "What training activities can Cohort AI manage?",
      a: "Cohort AI covers programmes, batches, applications and enrolment, classes and attendance, assignments and submissions, mentors, placements, fees and certificates.",
      evidence: ["docs/products.md:104-114", "src/lib/products/cohort-ai/programs.ts:79-143", "src/lib/products/cohort-ai/assignments.ts:103-184"],
    },
    {
      q: "Which delivery modes can a Cohort AI programme use?",
      a: "Programmes can use online, offline or hybrid delivery.",
      evidence: ["src/lib/products/cohort-ai/constants.ts:61-78", "src/lib/products/cohort-ai/validation.ts:1-60"],
    },
    {
      q: "What kinds of assessments can EvalIQ support?",
      a: "EvalIQ's test types include practice, assessment, examination, mock, screening, certification, training, interview and custom tests.",
      evidence: ["docs/products.md:182-201", "src/lib/products/evaliq/constants.ts:6-18"],
    },
    {
      q: "How many question types does EvalIQ support?",
      a: "EvalIQ has 17 registered question types spanning objective, text, technical, matching and media questions.",
      evidence: ["docs/products.md:186-188", "src/lib/products/evaliq/question-types.ts:14-42"],
    },
    {
      q: "Can a Playbook AI procedure be saved as a draft?",
      a: "Yes. SOPs have a Draft state; a first publish requires a purpose, scope and procedure content.",
      evidence: ["src/lib/products/playbook-ai/constants.ts:26-43", "src/lib/products/playbook-ai/sops.ts:179-282", "src/lib/products/playbook-ai/sops.ts:454-480"],
    },
    {
      q: "Does Playbook AI require an approval stage before publishing an SOP?",
      a: "No. The implemented lifecycle is Draft, Published and Active; publication is permission-controlled and there is no separate review or approval state.",
      evidence: ["src/lib/products/playbook-ai/constants.ts:21-25", "src/lib/products/playbook-ai/access.ts:88-96", "src/lib/products/playbook-ai/sops.ts:454-480"],
    },
    {
      q: "What can CyberVault store?",
      a: "CyberVault stores credentials, documents, URL or account records, and notes.",
      evidence: ["docs/products.md:167-178", "src/lib/products/cybervault/constants.ts:9-16"],
    },
    {
      q: "Can CyberVault records be scoped to a company or a client?",
      a: "Yes. A record can have company scope or client scope; a client-scoped record refers to one client.",
      evidence: ["docs/products.md:167-174", "src/lib/products/cybervault/constants.ts:5-7", "src/lib/products/cybervault/records.ts:47-56"],
    },
    {
      q: "What website content can SiteCraft AI manage?",
      a: "SiteCraft AI manages website pages, sections, navigation, footer, forms, themes and publishing; collections can hold products or blog posts.",
      evidence: ["docs/products.md:268-276"],
    },
    {
      q: "Can SiteCraft AI create a page for any arbitrary URL?",
      a: "No. A new page path must match a route that the public site already has; creating a CMS record does not add a new route to the application.",
      evidence: ["src/app/(products)/sitecraft-ai/(protected)/pages/NewPageDialog.tsx:28-45"],
    },
    {
      q: "Where does SelfRun Sites serve a company's public website?",
      a: "SelfRun Sites serves the company's published public website on its configured domain, while SiteCraft AI is its paired content-management product.",
      evidence: ["docs/products.md:279-281"],
    },
    {
      q: "What SEO work can RankMax AI track?",
      a: "RankMax AI covers technical and on-page audits, keywords and rankings, content SEO, internal links, backlinks, competitors, sitemaps, robots.txt, schema, issues and tasks.",
      evidence: ["docs/products.md:251-256"],
    },
    {
      q: "Can RankMax AI run an audit immediately?",
      a: "Yes, when the signed-in user has RUN_AUDIT permission; the audit screen provides a Run audit now action.",
      evidence: ["src/app/(products)/rankmax-ai/(protected)/audit/page.tsx:37-43"],
    },
    {
      q: "Which publishing providers can ViralPulse AI connect?",
      a: "Its documented providers cover Meta (Facebook and Instagram), Google (YouTube and Business Profile), and LinkedIn.",
      evidence: ["src/lib/products/viralpulse-ai/constants.ts:7-16", "src/lib/products/viralpulse-ai/integrations.ts:105-139"],
    },
    {
      q: "Does ViralPulse AI publish generated content automatically?",
      a: "No. Generated content is not published automatically; publishing requires an explicit Publish action or an approved schedule with Publish permission.",
      evidence: ["src/app/(products)/viralpulse-ai/(protected)/settings/page.tsx:50-58", "src/lib/products/viralpulse-ai/publishing.ts:17-24"],
    },
  ],
};

export const FAQ_GROUPS: FaqHubGroup[] = [
  general,
  ...AI_SUPPORT_COLLABORATION_FAQS,
  ...OPERATIONS_PEOPLE_FAQS,
  ...BUSINESS_WORKFLOWS_FAQS,
  ...PLATFORM_CONTENT_FAQS,
  ...PEOPLE_TRAINING_SECURITY_FAQS,
].map((group) => group.id === "general" ? group : { ...group, title: selfRunProductName(group.title) });
