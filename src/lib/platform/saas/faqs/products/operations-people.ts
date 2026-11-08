import type { FaqHubGroup } from "@/lib/platform/saas/faqs";
import { productPath } from "@/lib/platform/saas/product-routes";

export const OPERATIONS_PEOPLE_FAQS: FaqHubGroup[] = [
  {
    id: "commandos",
    title: "SelfRun CommandOS",
    href: productPath("workspace"),
    items: [
      {
        q: "What is CommandOS for?",
        a: "CommandOS is a company's operating home: it brings together a personal product dashboard and company settings.",
        evidence: ["docs/products.md:40-47"],
      },
      {
        q: "Does every employee get the same CommandOS dashboard?",
        a: "No. The dashboard greets the signed-in user and builds its product and analytics panels from that user's allowed navigation.",
        evidence: ["src/app/(products)/commandos/(protected)/page.tsx:29-44,57-58"],
      },
      {
        q: "Why might I not see a product on my dashboard?",
        a: "The product list is filtered against your allowed navigation; an administrator may need to grant the appropriate access.",
        evidence: ["src/app/(products)/commandos/(protected)/page.tsx:29-44", "docs/products.md:49-52"],
      },
      {
        q: "Why is an analytics panel missing?",
        a: "Analytics panels are filtered separately using analytics permissions, so product access alone does not necessarily make every analytics panel visible.",
        evidence: ["src/app/(products)/commandos/(protected)/page.tsx:43-44"],
      },
      {
        q: "Does the dashboard cover products a company has not enabled?",
        a: "The dashboard uses the company's panel registry and excludes panels marked unavailable for that company.",
        evidence: ["src/app/(products)/commandos/(protected)/page.tsx:30-44"],
      },
      {
        q: "What does the CommandOS home page show?",
        a: "It presents product performance for the workspace, with a personalized greeting and current-date context.",
        evidence: ["src/app/(products)/commandos/(protected)/page.tsx:53-58"],
      },
      {
        q: "Can a manager get access to all company products by default?",
        a: "Access is permission-based rather than implied by a dashboard role; CommandOS calculates allowed navigation for the signed-in session.",
        evidence: ["src/app/(products)/commandos/(protected)/page.tsx:29-44", "docs/products.md:49-52"],
      },
      {
        q: "Where can an administrator manage company staff accounts?",
        a: "Use CommandOS's centralized Users page to view and administer the product-wise company roster.",
        evidence: ["src/app/(products)/commandos/(protected)/users/page.tsx:61-66"],
      },
      {
        q: "Can the Users page find a particular account?",
        a: "Yes. Its filters can narrow the roster by search text, role, product, active/deactivated status and user type.",
        evidence: ["src/app/(products)/commandos/(protected)/users/page.tsx:23-57"],
      },
      {
        q: "Can I see only active users?",
        a: "The roster accepts an active or deactivated status filter, so you can narrow the list to either state.",
        evidence: ["src/app/(products)/commandos/(protected)/users/page.tsx:23-46"],
      },
      {
        q: "How do product-specific user access rules work?",
        a: "User administration is centralized across product consoles, while the user's role and permissions govern the product areas they can reach.",
        evidence: ["src/app/(products)/commandos/(protected)/users/page.tsx:61-64", "docs/products.md:45-52"],
      },
      {
        q: "Can CommandOS use custom roles?",
        a: "Yes. A Director can define custom roles that combine product access with specific permissions.",
        evidence: ["src/app/(products)/commandos/(protected)/roles/page.tsx:11-21"],
      },
      {
        q: "Who is allowed to define a custom role?",
        a: "Role definitions grant permissions, so creating or changing them is reserved for a Director.",
        evidence: ["src/app/(products)/commandos/(protected)/roles/page.tsx:11-14"],
      },
      {
        q: "Can a custom role be limited to selected products?",
        a: "Yes. The role builder describes choosing which products a role opens and which actions it may perform.",
        evidence: ["src/app/(products)/commandos/(protected)/roles/page.tsx:16-21"],
      },
      {
        q: "Can a user manager assign an existing custom role?",
        a: "Yes. A delegated user manager can assign existing roles on the Users page, but cannot define a role that grants permissions.",
        evidence: ["src/app/(products)/commandos/(protected)/roles/page.tsx:11-14"],
      },
      {
        q: "What happens when an administrator updates a custom role?",
        a: "The updated permissions apply to everyone who holds that role; the page also displays role-access audit history.",
        evidence: ["src/app/(products)/commandos/(protected)/roles/page.tsx:13,16-21"],
      },
      {
        q: "Can an administrator remove a custom role?",
        a: "The role actions include deletion; the result reports how many users are affected.",
        evidence: ["src/app/(products)/commandos/(protected)/roles/actions.ts:26-45"],
      },
      {
        q: "Can an administrator change a user's roles?",
        a: "Yes, users can be assigned role changes through a dedicated action that records an access-audit entry.",
        evidence: ["src/app/(products)/commandos/(protected)/users/actions.ts:68-91"],
      },
      {
        q: "Can an administrator deactivate several accounts at once?",
        a: "Yes. There is a bulk-deactivation action, and its result distinguishes deactivated users from skipped users.",
        evidence: ["src/app/(products)/commandos/(protected)/users/actions.ts:139-150"],
      },
      {
        q: "Can admins inspect a user's activity?",
        a: "The Users area provides an action to retrieve user activity for an administrator.",
        evidence: ["src/app/(products)/commandos/(protected)/users/actions.ts:163-172"],
      },
      {
        q: "Where can I review changes made across the workspace?",
        a: "The CommandOS Audit log brings together workspace and product activity and describes who did what and when.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/audit-log/page.tsx:55-64,90-93"],
      },
      {
        q: "Can I search or filter the audit log?",
        a: "Yes. The audit view supports search, module, action and date filters.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/audit-log/page.tsx:111-138"],
      },
      {
        q: "Does the audit log include product activity?",
        a: "It can combine workspace events with the products' own activity logs; which sources are shown depends on the view and access.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/audit-log/page.tsx:55-64"],
      },
      {
        q: "Can I export activity records?",
        a: "The product activity audit view supports CSV export when the user has the Audit log permission.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/audit-log/page.tsx:55-58"],
      },
      {
        q: "Does the audit log show before-and-after details?",
        a: "The documented company audit trail records who acted, when they acted and before-and-after details for supported changes.",
        evidence: ["docs/products.md:49-52"],
      },
      {
        q: "Can I filter audit entries by the type of company area?",
        a: "Yes. The audit filters include a module selection as well as action and date filters.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/audit-log/page.tsx:111-138"],
      },
      {
        q: "Can I view activity created by data imports?",
        a: "Import-origin activity is labeled in the merged audit display.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/audit-log/page.tsx:190-196"],
      },
      {
        q: "What can CommandOS automations do?",
        a: "Configured automations can respond to workspace events by notifying people, sending email or calling a webhook.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/automations/page.tsx:31-34"],
      },
      {
        q: "Do automations run on every event?",
        a: "Each automation is configured with a trigger and may include conditions; its selected actions determine what happens.",
        evidence: ["src/lib/platform/workflows/shared.ts:50,142-165"],
      },
      {
        q: "Can an automation send a notification?",
        a: "Yes. Notification is one of the workflow action types; it can be addressed to a configured role.",
        evidence: ["src/lib/platform/workflows/templates.ts:9-22"],
      },
      {
        q: "Can an automation send an email?",
        a: "Yes. Email is a supported workflow action, with its destination and message configured for the workflow.",
        evidence: ["src/lib/platform/workflows/templates.ts:34-38"],
      },
      {
        q: "Can a workflow call an external webhook?",
        a: "Yes. A webhook action is implemented; whether it runs successfully depends on the configured destination and delivery.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/automations/page.tsx:31-34", "src/lib/platform/workflows/run.ts:80-85"],
      },
      {
        q: "Can I test an automation before relying on it?",
        a: "There is a test-run action that executes a workflow in test mode and returns per-action results.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/automations/actions.ts:66-72", "src/lib/platform/workflows/run.ts:149-150"],
      },
      {
        q: "Can I turn an automation on or off?",
        a: "Yes. CommandOS includes a workflow-enable action; the automation's enabled state is explicitly updated.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/automations/actions.ts:53-54"],
      },
      {
        q: "Can I restore an earlier automation setup?",
        a: "An earlier saved version can be restored; restoring it is recorded as a new version.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/automations/actions.ts:86-92", "src/lib/platform/workflows/versions.ts:51-61"],
      },
      {
        q: "Can I start an automation from a template?",
        a: "Yes. The automation actions include adding a workflow template, subject to the company's configuration and limits.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/automations/actions.ts:39-43"],
      },
      {
        q: "Is there a fixed number of automations available?",
        a: "The application enforces a configured per-company workflow limit; the available count can depend on the company's entitlements.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/automations/page.tsx:11-12", "src/app/(products)/commandos/(protected)/settings/automations/actions.ts:3-8"],
      },
      {
        q: "Can I import existing business data into CommandOS?",
        a: "The import wizard supports CSV files for leads, clients and employees, with a preview before saving.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/import/page.tsx:23-26"],
      },
      {
        q: "Does a CSV import save immediately?",
        a: "The import screen offers a preview before records are saved, so you can review the import first.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/import/page.tsx:23-26"],
      },
      {
        q: "Who can run a CommandOS data import?",
        a: "The import endpoint explicitly restricts import execution to a Director.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/import/run/route.ts:17-20"],
      },
      {
        q: "Can I export a copy of workspace data?",
        a: "The Import data screen also offers a copy/export of the workspace's data.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/import/page.tsx:23-26"],
      },
      {
        q: "Where do I update the company profile?",
        a: "Use Organization profile in CommandOS settings; that screen includes company details such as industry, size, country, currency and time zone.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/profile/page.tsx:17,25-36"],
      },
      {
        q: "Can I change the company's branding?",
        a: "Yes. The Branding settings let an administrator manage the logo, name and theme used by the website and products.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/branding/page.tsx:18,26-27"],
      },
      {
        q: "Can a company use its own app domain?",
        a: "The Domains settings guide an administrator through using a company domain for the website and an app subdomain for its workspace; SSL is added after setup.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/domains/page.tsx:20,29-30"],
      },
      {
        q: "Where do I see the workspace plan and invoices?",
        a: "CommandOS's Plan & billing area shows the workspace subscription, plan usage and invoice details.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/billing/page.tsx:50-56,111"],
      },
      {
        q: "Who can open billing settings?",
        a: "The billing page redirects users who are not Directors, so billing access is restricted by role.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/billing/page.tsx:50-56"],
      },
      {
        q: "Can the company connect payment services?",
        a: "The Payments settings describe connecting the company's Razorpay account for customer payments and, when configured, RazorpayX salary disbursements.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/payments/page.tsx:18,26-27"],
      },
      {
        q: "Are company payment settings available to every user?",
        a: "No. The Payments page checks for a Director role and redirects users without it.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/payments/page.tsx:18-20"],
      },
      {
        q: "Which external accounts can be connected in Integrations?",
        a: "The settings page describes connecting company-owned social, Google and payment accounts; which integrations are available depends on the configured options.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/integrations/page.tsx:18,55-56"],
      },
      {
        q: "Are integration keys shown again after saving?",
        a: "The Integrations screen says keys are encrypted and are not shown again after entry.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/integrations/page.tsx:55-56"],
      },
      {
        q: "Where can I review usage and limits?",
        a: "Use the Usage & limits settings page, which is protected by the company-usage permission.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/usage/page.tsx:19,30-31"],
      },
      {
        q: "Can CommandOS manage people outside the staff roster?",
        a: "Yes. A separate External Portal Users page lists ClientOS users and supports filtering by role and status.",
        evidence: ["src/app/(products)/commandos/(protected)/portal/users/page.tsx:22-43,57-58"],
      },
      {
        q: "Can an admin open a portal user's linked business record?",
        a: "When a portal user has a linked applicant, learner or client record, CommandOS can link to that corresponding product record.",
        evidence: ["src/app/(products)/commandos/(protected)/portal/users/page.tsx:9-12"],
      },
      {
        q: "Can an administrator manage security settings?",
        a: "Yes. The Security settings page requires the company's security permission.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/security/page.tsx:7,20,29"],
      },
      {
        q: "Where did the CommandOS mobile app settings move?",
        a: "The old mobile app settings route redirects to Apps, where app settings, downloads and desktop builds are grouped.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/app/page.tsx:1-6"],
      },
      {
        q: "Does the company have an audit trail for administrative changes?",
        a: "Yes. CommandOS documents a company-wide audit log, including who made a change, when and before-and-after details for supported changes.",
        evidence: ["docs/products.md:45-52", "src/app/(products)/commandos/(protected)/settings/audit-log/page.tsx:90-93"],
      },
      {
        q: "Can I tell if a product is unavailable versus merely hidden from me?",
        a: "The dashboard checks both your allowed navigation and company-unavailable panel keys; visibility can therefore reflect access or company configuration.",
        evidence: ["src/app/(products)/commandos/(protected)/page.tsx:29-44"],
      },
      {
        q: "Can roles grant access to analytics as well as product screens?",
        a: "Yes. CommandOS checks product navigation and analytics navigation independently, so the matching role permissions need to be configured.",
        evidence: ["src/app/(products)/commandos/(protected)/page.tsx:43-44", "src/app/(products)/commandos/(protected)/roles/page.tsx:16-21"],
      },
      {
        q: "Where can a delegated admin check the product roster?",
        a: "The centralized Users page is the roster view; available management actions remain subject to the administrator's assigned permissions.",
        evidence: ["src/app/(products)/commandos/(protected)/users/page.tsx:7-12,61-66"],
      },
    ],
  },
  {
    id: "clientos",
    title: "SelfRun ClientOS",
    href: productPath("portal"),
    items: [
      {
        q: "Who uses ClientOS?",
        a: "ClientOS is a self-service portal for clients, businesses, students, interns and job applicants, with different screens for each portal role.",
        evidence: ["docs/products.md:285-294", "src/lib/portal-roles.ts:2-12"],
      },
      {
        q: "Is a ClientOS account the same as a staff login?",
        a: "No. ClientOS users live in a separate external-user identity collection rather than the internal staff-user collection.",
        evidence: ["src/lib/portal-roles.ts:2-7", "docs/products.md:287-290"],
      },
      {
        q: "How many portal roles does ClientOS support?",
        a: "The portal role model defines job applicant, intern, trainee and client roles.",
        evidence: ["src/lib/portal-roles.ts:12-15"],
      },
      {
        q: "Does ClientOS show the same navigation to every user?",
        a: "No. Its sidebar is generated from the signed-in user's portal role, and route guards restrict role-specific pages.",
        evidence: ["src/lib/portal-roles.ts:7,48-49,132-139"],
      },
      {
        q: "How does a new portal account match an existing applicant, learner or client?",
        a: "Registration checks the email and phone against a matching business record; use the same email and phone that were provided with that record.",
        evidence: ["src/lib/products/clientos/registration.ts:22,27-38"],
      },
      {
        q: "Can I register with a different contact email from the one on file?",
        a: "The registration match uses the supplied email and phone, so they need to match the existing record.",
        evidence: ["src/lib/products/clientos/registration.ts:22,27-38"],
      },
      {
        q: "What information does the registration form require?",
        a: "The registration action requires email, phone, password and matching password confirmation; it may also accept a referral code.",
        evidence: ["src/app/(products)/clientos/register/actions.ts:15-25"],
      },
      {
        q: "Why does registration say it could not match my details?",
        a: "The portal could not match the supplied email and phone to an application, enrolment or client record; check that they are the exact details on file.",
        evidence: ["src/lib/products/clientos/registration.ts:22,27-38"],
      },
      {
        q: "Can I register a second account with the same email?",
        a: "The registration service rejects an email that already has a portal account; use sign-in or password reset instead.",
        evidence: ["src/lib/products/clientos/registration.ts:34-35"],
      },
      {
        q: "How does ClientOS decide whether I'm an applicant, learner or client?",
        a: "The matched record supplies the portal role and its linked application, student or client identifier.",
        evidence: ["src/lib/products/clientos/registration.ts:37-52"],
      },
      {
        q: "Can I recover access using a lead or application record that has no portal account yet?",
        a: "The password-reset verification can restore an account from a matching on-file email and phone; the response avoids revealing whether an email has an account.",
        evidence: ["src/lib/products/clientos/registration.ts:84-94"],
      },
      {
        q: "What does the client portal dashboard focus on?",
        a: "Client-facing screens include project progress and invoices, while learner and applicant dashboards show their own role-specific information.",
        evidence: ["docs/products.md:287-290", "src/lib/portal-roles.ts:118-126"],
      },
      {
        q: "What training records can a learner see?",
        a: "ClientOS reads the learner view from Cohort AI services, including enrolments, attendance, assignments, payments, projects and certificates linked to the student's record.",
        evidence: ["src/lib/products/clientos/student.ts:2-14,34-47", "src/app/(products)/clientos/(app)/attendance/page.tsx:15-24"],
      },
      {
        q: "Are intern and trainee portals completely different?",
        a: "Interns and trainees share learner modules, though the navigation labels and dashboard presentation differ by role.",
        evidence: ["src/lib/portal-roles.ts:42-44,89-97,116-117"],
      },
      {
        q: "Where can I see my programme or internship?",
        a: "Learners have a My Programme or My Internship portal page selected according to their role.",
        evidence: ["src/lib/portal-roles.ts:89-91,116-117"],
      },
      {
        q: "Where do learners find their class or batch schedule?",
        a: "The learner portal provides a Class Schedule or Batch Schedule, with upcoming and completed sessions shown separately.",
        evidence: ["src/lib/portal-roles.ts:89-91,116-117", "src/app/(products)/clientos/(app)/schedule/page.tsx:39-47"],
      },
      {
        q: "Can learners join an online class from the schedule?",
        a: "When a scheduled class has a meeting link, the schedule renders a Join link for it.",
        evidence: ["src/app/(products)/clientos/(app)/schedule/page.tsx:25-30"],
      },
      {
        q: "What if I have not been placed in a learner batch yet?",
        a: "The schedule shows an empty state explaining that the class schedule appears after placement in a batch.",
        evidence: ["src/app/(products)/clientos/(app)/schedule/page.tsx:39-42"],
      },
      {
        q: "Can learners check attendance in ClientOS?",
        a: "Yes. Learners can see attended and total sessions, an attendance-rate indicator and counts grouped by recorded status.",
        evidence: ["src/app/(products)/clientos/(app)/attendance/page.tsx:15-24,30-40"],
      },
      {
        q: "Will attendance show before classes start?",
        a: "If no learner overview exists yet, the attendance page explains that records appear once classes begin.",
        evidence: ["src/app/(products)/clientos/(app)/attendance/page.tsx:15-17"],
      },
      {
        q: "Where can I review learner assignments?",
        a: "Assignments for the learner's batch are shown in the Assignments page, with pending and submitted counts.",
        evidence: ["src/app/(products)/clientos/(app)/assignments/page.tsx:23-33"],
      },
      {
        q: "How does ClientOS count submitted assignments?",
        a: "A submission marked for resubmission is not counted as submitted in the assignments summary.",
        evidence: ["src/app/(products)/clientos/(app)/assignments/page.tsx:27-33"],
      },
      {
        q: "Can a learner submit work from the assignment list?",
        a: "The page displays each assignment's submission state; submission actions depend on the linked assignment flow and its status.",
        evidence: ["src/app/(products)/clientos/(app)/assignments/page.tsx:27-33,54-62"],
      },
      {
        q: "Which certificates appear in the learner portal?",
        a: "The certificate page lists issued, non-revoked learner certificates; a completion certificate may not appear until it is issued.",
        evidence: ["src/app/(products)/clientos/(app)/certificates/page.tsx:16-25,36-38"],
      },
      {
        q: "Can job applicants check an application from ClientOS?",
        a: "Yes. The applicant-only application page loads the record linked to that portal account and displays its current status and position.",
        evidence: ["src/app/(products)/clientos/(app)/application/page.tsx:18-30"],
      },
      {
        q: "Can applicants see recruiter updates?",
        a: "The applicant's application page includes a Recruiter updates section when application data is available.",
        evidence: ["src/app/(products)/clientos/(app)/application/page.tsx:45-57"],
      },
      {
        q: "Can applicants view an offer status?",
        a: "When an offer is linked to the application, its status is displayed in the applicant's application view.",
        evidence: ["src/app/(products)/clientos/(app)/application/page.tsx:57-71"],
      },
      {
        q: "Where can an applicant follow their application journey?",
        a: "The My Journey page displays the current portal-friendly stage and a hiring timeline for the linked lead.",
        evidence: ["src/app/(products)/clientos/(app)/journey/page.tsx:15-23,32"],
      },
      {
        q: "Can applicants take assessments through the portal?",
        a: "The applicant navigation includes Assessments, and the shared tests page is available to applicant and learner test-taker roles.",
        evidence: ["src/lib/portal-roles.ts:104-110,133-139", "src/app/(products)/clientos/(app)/tests/page.tsx:17-23"],
      },
      {
        q: "Do learners and applicants see the same tests?",
        a: "The tests page adapts its title and test channel to the signed-in role, so applicant assessments are distinct in presentation from learner tests.",
        evidence: ["src/app/(products)/clientos/(app)/tests/page.tsx:17-23"],
      },
      {
        q: "Where can a client see projects?",
        a: "The client version of My Projects loads the client overview, including projects and their overall progress.",
        evidence: ["src/app/(products)/clientos/(app)/projects/page.tsx:17-24"],
      },
      {
        q: "Can interns and trainees see projects too?",
        a: "Yes. The learner version loads assigned live projects from the learner overview rather than the client project list.",
        evidence: ["src/app/(products)/clientos/(app)/projects/page.tsx:17-21,56-61"],
      },
      {
        q: "Where do clients review project milestones?",
        a: "The client-only Milestones page summarizes project delivery progress and shows an empty state until projects are underway.",
        evidence: ["src/app/(products)/clientos/(app)/milestones/page.tsx:24-30"],
      },
      {
        q: "Can clients see planned reviews or delivery dates?",
        a: "The Meetings & Reviews page derives upcoming entries from the client's project milestones and delivery dates.",
        evidence: ["src/app/(products)/clientos/(app)/meetings/page.tsx:17-23"],
      },
      {
        q: "How far ahead does the meetings page check?",
        a: "The page's empty-state message identifies the upcoming window as 60 days.",
        evidence: ["src/app/(products)/clientos/(app)/meetings/page.tsx:32"],
      },
      {
        q: "Can clients see invoices in ClientOS?",
        a: "Yes. ClientOS loads invoices associated with the signed-in client; draft and void CashFlow invoices are filtered out of this client-facing list.",
        evidence: ["src/app/(products)/clientos/(app)/invoices/page.tsx:6-8,30-37", "src/lib/products/cashflow-ai/portal-invoices.ts:26-35"],
      },
      {
        q: "Will a draft or void invoice be visible to a client?",
        a: "No. The ClientOS invoice service excludes both draft and void invoice statuses.",
        evidence: ["src/lib/products/cashflow-ai/portal-invoices.ts:26-35"],
      },
      {
        q: "Can a client distinguish a formal invoice from an amount still in progress?",
        a: "The invoices page separates issued tax invoices from amounts still in progress that have not yet been formally invoiced.",
        evidence: ["src/app/(products)/clientos/(app)/invoices/page.tsx:97,159"],
      },
      {
        q: "Can clients download an invoice?",
        a: "The invoice list links to a ClientOS invoice endpoint for the selected invoice number.",
        evidence: ["src/app/(products)/clientos/(app)/invoices/page.tsx:66-79"],
      },
      {
        q: "Can a client use wallet credits toward an invoice?",
        a: "When the invoice has usable credits, the page offers a credit-payment action; eligibility and available balance determine whether it is shown.",
        evidence: ["src/app/(products)/clientos/(app)/invoices/page.tsx:34,75-79", "src/app/(products)/clientos/(app)/wallet/pay-actions.ts:18"],
      },
      {
        q: "Can learners pay programme fees with credits?",
        a: "The learner payment page offers a credit-payment action for an eligible fee plan when the available credit quote allows it.",
        evidence: ["src/app/(products)/clientos/(app)/payments/page.tsx:31-37,89", "src/app/(products)/clientos/(app)/wallet/pay-actions.ts:7"],
      },
      {
        q: "Are ClientOS wallet credits the same as cash?",
        a: "No. The wallet describes credits as promotional or reward credits, not cash, and says eligibility, expiry, redemption limits and campaign rules apply.",
        evidence: ["src/app/(products)/clientos/(app)/wallet/page.tsx:102"],
      },
      {
        q: "Can a portal user refer someone?",
        a: "The portal has a Refer & earn page with a shareable referral link and role-specific reward logic.",
        evidence: ["src/app/(products)/clientos/(app)/referrals/page.tsx:22-30", "src/lib/portal-roles.ts:66-74"],
      },
      {
        q: "Where can users review rewards for completing journey stages?",
        a: "ClientOS has a Journey rewards page with stage reward history; entries depend on progress and configured rewards.",
        evidence: ["src/app/(products)/clientos/(app)/rewards/journey/page.tsx:21,94"],
      },
      {
        q: "Does every portal role get Wallet navigation?",
        a: "Wallet navigation is composed into the learner and client menus; which modules a role sees is defined in the role navigation map.",
        evidence: ["src/lib/portal-roles.ts:82-97,118-126"],
      },
      {
        q: "Can a portal user message the company team?",
        a: "The portal includes a Messages page for communicating with the company team, and a send-message action handles portal messages.",
        evidence: ["src/app/(products)/clientos/(app)/messages/page.tsx:14-20", "src/app/(products)/clientos/(app)/messages/actions.ts:15"],
      },
      {
        q: "Can a message include attachments?",
        a: "The portal message action accepts an optional attachment list.",
        evidence: ["src/app/(products)/clientos/(app)/messages/actions.ts:15"],
      },
      {
        q: "Can I update my portal profile?",
        a: "ClientOS has a Profile & Settings page and a profile-update action for portal users.",
        evidence: ["src/app/(products)/clientos/(app)/profile/page.tsx:17-22", "src/app/(products)/clientos/(app)/profile/actions.ts:15"],
      },
      {
        q: "Can I see documents shared with my portal account?",
        a: "The Documents page loads the documents available to the signed-in portal user.",
        evidence: ["src/app/(products)/clientos/(app)/documents/page.tsx:30-35"],
      },
      {
        q: "Can applicants and learners both receive documents?",
        a: "The documents page resolves available files for the current portal identity; actual files depend on what is shared with that account.",
        evidence: ["src/app/(products)/clientos/(app)/documents/page.tsx:30-35", "src/lib/portal-roles.ts:104-126"],
      },
      {
        q: "Can portal users see payment history?",
        a: "Learner navigation includes Payments, and the learner payment page is guarded for intern and trainee roles.",
        evidence: ["src/lib/portal-roles.ts:89-97,116-117", "src/app/(products)/clientos/(app)/payments/page.tsx:31-37"],
      },
      {
        q: "Does the client portal expose staff tools?",
        a: "No. ClientOS is a separate external portal identity, not an internal staff login, and its role navigation is limited to portal modules.",
        evidence: ["docs/products.md:287-294", "src/lib/portal-roles.ts:2-7,48-49"],
      },
      {
        q: "What should I do if a portal page says there is no record yet?",
        a: "Several views show an empty state until the associated client project, learner batch, assignment, application or certificate exists.",
        evidence: ["src/app/(products)/clientos/(app)/projects/page.tsx:20-21,56-57", "src/app/(products)/clientos/(app)/assignments/page.tsx:23-25", "src/app/(products)/clientos/(app)/certificates/page.tsx:16-18"],
      },
    ],
  },
  {
    id: "dealflow-ai",
    title: "SelfRun DealFlow AI",
    href: productPath("lms"),
    items: [
      {
        q: "What sales and recruitment work does DealFlow AI bring together?",
        a: "It covers inbound leads and clients, a pipeline and timelines, messages, campaign analytics, career applicants, offers and coupons, wallet credits, and the website chatbot and voice assistant.",
        evidence: ["docs/products.md:128-137"],
      },
      {
        q: "Can I track an enquiry from its first contact?",
        a: "DealFlow AI's documented workflow tracks website enquiries from first contact through to close.",
        evidence: ["docs/products.md:130-136"],
      },
      {
        q: "Can one lead process fit every kind of enquiry?",
        a: "Lead stages are workflow-specific by lead type, so the stage path for one kind of record need not match another.",
        evidence: ["src/lib/lead-management/workflows.ts:1-7,66-78"],
      },
      {
        q: "Which lead outcomes are treated as finished?",
        a: "Won and lost are terminal lead outcomes; rejected or dropped stages can also be terminal for a particular type.",
        evidence: ["src/lib/lead-management/workflows.ts:7,88-93,108-114"],
      },
      {
        q: "Can DealFlow stop a lead from skipping arbitrary stages?",
        a: "Its workflow logic offers the next valid stage for the record type, while terminal reject, drop or lost outcomes can be selected separately.",
        evidence: ["src/lib/lead-management/workflows.ts:88-93"],
      },
      {
        q: "Can I see lead counts by pipeline stage?",
        a: "The Lead Management page builds stage cards and counts for each non-terminal stage in the selected lead workflow.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/leads/page.tsx:34,79-87"],
      },
      {
        q: "Can I filter the lead list?",
        a: "The All leads view accepts lead type, open/won/lost status, source and search filters.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/leads/list/page.tsx:42-46,61"],
      },
      {
        q: "Can I review only open or won leads?",
        a: "Yes. The lead list validates and accepts open, won or lost as a status filter.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/leads/list/page.tsx:42-46"],
      },
      {
        q: "Does the lead dashboard require a particular permission?",
        a: "The Lead Management dashboard requires the VIEW_LEADS permission.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/leads/page.tsx:27-34"],
      },
      {
        q: "Can I see how long a lead has been at its current stage?",
        a: "Lead records carry a stage-entered timestamp, which supports the stage timeline and duration history.",
        evidence: ["src/lib/lead-management/types.ts:61-69", "src/lib/lead-management/records.ts:177-187"],
      },
      {
        q: "What information can I inspect on a lead detail page?",
        a: "The detail view includes the lead's source and code, current stage, timeline and messages, with extra interview information for job-applicant leads.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/leads/[id]/page.tsx:11-18,40,49,63,103,119"],
      },
      {
        q: "Can I see the source of a lead?",
        a: "Yes. DealFlow AI labels the lead source on its detail page and has source metadata for lead records.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/leads/[id]/page.tsx:15,63", "src/lib/lead-management/types.ts:61-69"],
      },
      {
        q: "Does a lead's timeline include stage changes?",
        a: "The lead detail page loads a timeline, and stage updates write the new stage and its entered-at time to the record.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/leads/[id]/page.tsx:40,49", "src/lib/lead-management/records.ts:177-187"],
      },
      {
        q: "Can leads and portal users exchange messages?",
        a: "The Messages area is described as two-way conversations with leads and portal users.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/messages/page.tsx:12,16"],
      },
      {
        q: "Can a lead record link to a converted client?",
        a: "Lead records have a client identifier that points to the associated SprintOS client record when one has been linked.",
        evidence: ["src/lib/lead-management/types.ts:61-78"],
      },
      {
        q: "Can a lead detail view show previous messages?",
        a: "The lead detail page loads that lead's messages alongside the record.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/leads/[id]/page.tsx:11"],
      },
      {
        q: "Can one message conversation support more than text?",
        a: "Lead messages have typed attachment kinds for images, voice, video and files; available attachments depend on the message flow.",
        evidence: ["src/lib/lead-management/types.ts:132-152", "src/lib/lead-management/messages.ts:48-58"],
      },
      {
        q: "Where do I find campaign performance?",
        a: "Campaign Analytics is the DealFlow AI screen for reviewing campaign performance and its attributed leads.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/campaigns/page.tsx:56,129"],
      },
      {
        q: "Can campaign analytics include imported advertising data?",
        a: "Yes. Product documentation includes imported ad-platform data in campaign analytics; which campaign data exists depends on imports and attribution.",
        evidence: ["docs/products.md:130-132", "src/app/(products)/dealflow-ai/(protected)/campaigns/page.tsx:87-91"],
      },
      {
        q: "What campaign data can I import from a CSV?",
        a: "The import sheet supports CSV exports from an ad platform in two modes: performance reports or lead-list exports matched to existing leads.",
        evidence: ["src/components/products/dealflow-ai/campaigns/CampaignImportSheet.tsx:27-28,79-86,123"],
      },
      {
        q: "Can I review previous campaign imports?",
        a: "Campaign Analytics displays a campaign-import history when imports exist.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/campaigns/page.tsx:87-91,129"],
      },
      {
        q: "Can I undo a campaign import?",
        a: "Yes. Campaign actions include undoing an import, then refreshing campaign analytics and attributed-lead views.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/campaigns/actions.ts:20-25"],
      },
      {
        q: "Can I assign selected leads to a campaign?",
        a: "The campaign action accepts selected lead IDs and a campaign name, then assigns the leads to that campaign.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/campaigns/actions.ts:30-43"],
      },
      {
        q: "Can I inspect the leads attributed to campaigns?",
        a: "The Attributed Leads view lists leads tied to a campaign or paid source.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/campaigns/leads/page.tsx:8-10,54-56"],
      },
      {
        q: "Which filters are available for attributed leads?",
        a: "The view supports campaign attribution filters including platform, source, campaign, date range, search and lead status.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/campaigns/leads/page.tsx:49,66-72"],
      },
      {
        q: "Does the campaign leads view have a separate access rule?",
        a: "Yes. The attributed-leads page requires VIEW_ANALYTICS permission.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/campaigns/leads/page.tsx:21"],
      },
      {
        q: "Can DealFlow identify UTM-attributed records?",
        a: "Lead detail distinguishes UTM attribution from imported-list and manual assignment sources.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/submissions/[category]/[id]/page.tsx:119"],
      },
      {
        q: "Can I review campaign spend and lead trends?",
        a: "Campaign Analytics includes campaign KPI and spend/leads chart components; results depend on imported or recorded campaign data.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/campaigns/page.tsx:12-16,56"],
      },
      {
        q: "Can I narrow campaign analytics to a date range?",
        a: "Campaign analytics resolves filter settings from the page's query parameters, including source, platform and campaign dimensions.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/campaigns/page.tsx:20,72-79"],
      },
      {
        q: "Can campaign analytics show leads grouped by campaign?",
        a: "Yes. The campaign page supplies campaign options to its filter controls and links to the attributed-leads view.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/campaigns/page.tsx:72-79,129"],
      },
      {
        q: "Does DealFlow AI also track career applicants?",
        a: "Yes. The Careers area includes application analytics, status summaries and an applicant list.",
        evidence: ["docs/products.md:130-132", "src/app/(products)/dealflow-ai/(protected)/careers/page.tsx:21,81,100,201"],
      },
      {
        q: "Can recruiters filter applications?",
        a: "The career dashboard filters by status, position, experience, location, search and date range; the applicant list also supports status filtering.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/page.tsx:81", "src/app/(products)/dealflow-ai/(protected)/careers/applicants/page.tsx:34,75-97"],
      },
      {
        q: "Can I see a hiring funnel?",
        a: "The Careers dashboard renders a conversion funnel from its application-stage statistics.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/page.tsx:100,201"],
      },
      {
        q: "Can careers activity be exported?",
        a: "The Careers dashboard includes an application export control.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/page.tsx:13,106"],
      },
      {
        q: "Can I update an applicant's status?",
        a: "Yes. An application-status action validates the requested status before updating the application.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/actions.ts:18-21"],
      },
      {
        q: "Can I update several application statuses at once?",
        a: "Yes. Bulk status updates validate the requested status and report how many records were updated.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/actions.ts:44-52"],
      },
      {
        q: "Can recruiters keep internal notes on an application?",
        a: "The careers actions include an application-notes update.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/actions.ts:32-42"],
      },
      {
        q: "Can a recruiter delete applications in bulk?",
        a: "A bulk-delete action is available for career applications and reports the deletion count.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/actions.ts:60-68"],
      },
      {
        q: "What can I review on an applicant's detail page?",
        a: "The detail view brings together the application, linked portal-account state, messages, interview information, offer details and wallet information when those records exist.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/page.tsx:108,155,226,298-341,379-412"],
      },
      {
        q: "Can an applicant have a separate ClientOS account?",
        a: "The applicant record detail shows whether the linked portal account is active, suspended or not registered.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/page.tsx:155"],
      },
      {
        q: "Can a recruiter schedule an interview from the application?",
        a: "Interview actions let authorized users add an interview to an application and notify the applicant that it was scheduled.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/interview-actions.ts:30-55"],
      },
      {
        q: "Can an interview's status be updated?",
        a: "Yes. A dedicated action updates interview status for the application.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/interview-actions.ts:59-62"],
      },
      {
        q: "Can an interview be removed from an application?",
        a: "The interview actions include removing an interview and refreshing the applicant view.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/interview-actions.ts:66-69"],
      },
      {
        q: "Can a recruiter list interviews for one applicant?",
        a: "The interview action returns the interview list for the selected application.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/interview-actions.ts:73-75"],
      },
      {
        q: "Can applicants get interview notifications in their portal?",
        a: "Scheduling an interview sends an applicant notification when a matching job-applicant portal account is found.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/interview-actions.ts:25-28,54"],
      },
      {
        q: "Can a job-applicant lead show interview details?",
        a: "The lead detail page adds its interview panel for job-applicant lead records.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/leads/[id]/page.tsx:103,119"],
      },
      {
        q: "Can applicants' assessments be reviewed alongside their records?",
        a: "The applicant detail page has an Assessments & Screening Tests panel; the available records depend on the applicant's assessments.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/page.tsx:410"],
      },
      {
        q: "Can the applicant view the same career status as recruiters?",
        a: "ClientOS presents the linked applicant's current application status and position in its applicant-specific view.",
        evidence: ["src/app/(products)/clientos/(app)/application/page.tsx:18-30"],
      },
      {
        q: "Can an application have more than one attached document?",
        a: "The applicant detail view renders linked files, and a dedicated API route serves applicant documents; available files depend on the record.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/page.tsx:267", "src/app/(products)/api/dealflow-ai/applicants/[id]/documents/[docId]/route.ts:1-20"],
      },
      {
        q: "Can salary offer details be visible to every recruiter?",
        a: "The applicant detail view marks compensation as HR-only, so visibility depends on the user's permissions.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/page.tsx:298-305"],
      },
      {
        q: "Can DealFlow generate coupons or festival offers?",
        a: "Product documentation says DealFlow AI includes company-configured festival offers and coupons; the specific options depend on company configuration.",
        evidence: ["docs/products.md:130-137"],
      },
      {
        q: "Can referral rewards be configured without a deployment?",
        a: "The product documentation says offers, coupons and referral rewards are configured by the company without a deployment.",
        evidence: ["docs/products.md:134-137"],
      },
      {
        q: "Can a lead or client receive wallet credits?",
        a: "DealFlow AI includes a wallet and credits system with referrals, streaks and usage rules; credits remain subject to the configured rules.",
        evidence: ["docs/products.md:130-132"],
      },
      {
        q: "Does DealFlow AI provide a website chatbot?",
        a: "Yes. DealFlow AI manages the website's AI chatbot; product documentation describes it as providing an initial response to enquiries.",
        evidence: ["docs/products.md:130-136"],
      },
      {
        q: "Does DealFlow AI include a voice assistant?",
        a: "Yes. The product includes a website voice assistant alongside its chatbot; its exact behavior depends on the configured experience.",
        evidence: ["docs/products.md:130-136"],
      },
      {
        q: "Can I view chatbot conversations?",
        a: "A CommandOS admin can review website chatbot conversations with the dedicated screen; opening it requires the manage-chatbot-conversations permission.",
        evidence: ["src/app/(products)/commandos/(protected)/chatbot/conversations/page.tsx:29,70-71", "docs/products.md:130-132"],
      },
      {
        q: "Can I review voice-assistant conversations separately?",
        a: "Yes. CommandOS has a separate voice-conversations screen, restricted by its own permission, and an export route for those records.",
        evidence: ["src/app/(products)/commandos/(protected)/chatbot/voice-conversations/page.tsx:29,55-56", "src/app/(products)/api/commandos/chatbot/voice-conversations/export/route.ts:1-20"],
      },
      {
        q: "Do all users have permission to see sales and applicant records?",
        a: "DealFlow AI pages call their product-specific permission guards; the user's assigned permissions determine which lead, analytics or career screens they can access.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/leads/page.tsx:27-34", "src/app/(products)/dealflow-ai/(protected)/campaigns/leads/page.tsx:21", "src/app/(products)/dealflow-ai/(protected)/careers/applicants/page.tsx:31"],
      },
      {
        q: "Can I see notifications about lead changes?",
        a: "The DealFlow AI notifications view describes alerts for new leads, assignments, replies, stage changes and stale leads.",
        evidence: ["src/app/(products)/dealflow-ai/(protected)/notifications/page.tsx:7-8"],
      },
    ],
  },
  {
    id: "talentos",
    title: "SelfRun TalentOS",
    href: productPath("hrms"),
    items: [
      {
        q: "What people operations does TalentOS cover?",
        a: "TalentOS covers employee records, company structure, attendance, leave, payroll with payslips and payouts, and recruitment that can lead to employee onboarding.",
        evidence: ["docs/products.md:68-77"],
      },
      {
        q: "Can TalentOS show an employee directory?",
        a: "Yes. The employee directory searches workforce records, while the employee self-service directory shows the active workforce.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/employees/page.tsx:41-62", "src/app/(products)/talentos/(protected)/me/directory/page.tsx:8-26"],
      },
      {
        q: "Can HR filter the employee list?",
        a: "The staff employee list accepts search and filters such as department and designation, with options loaded from TalentOS master data.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/employees/page.tsx:18-53,83-88"],
      },
      {
        q: "Can the employee directory include inactive records?",
        a: "The staff employee search supports employee filters, while the self-service directory explicitly filters to active employee statuses.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/employees/page.tsx:41-53", "src/app/(products)/talentos/(protected)/me/directory/page.tsx:11-26"],
      },
      {
        q: "Does TalentOS generate employee IDs?",
        a: "A unique employee ID is generated automatically when an employee is saved.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/employees/new/page.tsx:32-33", "src/lib/products/talentos/employees.ts:122-130"],
      },
      {
        q: "Can a new employee be linked to a recruitment application?",
        a: "Yes. The add-employee flow accepts a source application, and the employee action records a recruitment conversion link.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/employees/new/page.tsx:7-9,16-20", "src/app/(products)/talentos/(protected)/(staff)/employees/actions.ts:48-79"],
      },
      {
        q: "Can HR update an employee record?",
        a: "The employee detail screen has a separate Edit page that loads department, designation and team options for the form.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/employees/[id]/edit/page.tsx:7-18,34-43"],
      },
      {
        q: "Can employee status be changed?",
        a: "Yes. The staff actions validate the requested status against supported employee statuses before saving the change.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/employees/actions.ts:144-165"],
      },
      {
        q: "Can I see the employee's department and designation?",
        a: "Employee details display department and designation from TalentOS's organization lookups.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/employees/[id]/page.tsx:110,296"],
      },
      {
        q: "Can a manager see an employee's reporting relationships?",
        a: "TalentOS stores reporting hierarchy data and can build an organization tree from its employee reporting structure.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/departments/page.tsx:18-19,57", "src/lib/products/talentos/hierarchy.ts:66-114"],
      },
      {
        q: "Where are departments and teams organized?",
        a: "The Departments & Teams page manages the organization's master data and reporting hierarchy.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/departments/page.tsx:18-31,46-57"],
      },
      {
        q: "Can a team have a lead?",
        a: "The organization screen includes each team's lead employee identifier in the data supplied to the manager.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/departments/page.tsx:46-49"],
      },
      {
        q: "Can designation levels be represented?",
        a: "The department management screen loads and passes designation levels alongside designation titles.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/departments/page.tsx:18-19,46"],
      },
      {
        q: "Can employees see an organization directory?",
        a: "The self-service My Directory view searches employees and includes only statuses classified as active.",
        evidence: ["src/app/(products)/talentos/(protected)/me/directory/page.tsx:8-26"],
      },
      {
        q: "Can employees clock in and out themselves?",
        a: "The My Attendance page exposes a clock widget, and its actions call the clock-in and clock-out operations for the signed-in employee.",
        evidence: ["src/app/(products)/talentos/(protected)/me/attendance/page.tsx:27-38", "src/app/(products)/talentos/(protected)/me/attendance/actions.ts:5,24-50"],
      },
      {
        q: "Can I review my own attendance by month?",
        a: "Yes. My Attendance accepts a month parameter and loads the employee's attendance for that month.",
        evidence: ["src/app/(products)/talentos/(protected)/me/attendance/page.tsx:12-18,27-38"],
      },
      {
        q: "Can HR view attendance for a whole department?",
        a: "The staff Attendance screen accepts a department filter and can load a daily register and monthly report for it.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/attendance/page.tsx:14-31,40-41"],
      },
      {
        q: "Can every manager correct attendance?",
        a: "The staff attendance screen distinguishes users who can edit from users who only get a daily overview; that ability depends on TalentOS permissions and scope.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/attendance/page.tsx:18-19,40-41"],
      },
      {
        q: "Can attendance be scoped to a manager's reports?",
        a: "The attendance data calls include a manager restriction when one applies to the signed-in user.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/attendance/page.tsx:25-30"],
      },
      {
        q: "Can employees see if today's clock record is locked?",
        a: "The self-service attendance page passes a lock state to the clock widget, and its actions check whether the record is unlocked before clocking.",
        evidence: ["src/app/(products)/talentos/(protected)/me/attendance/page.tsx:18,35-38", "src/app/(products)/talentos/(protected)/me/attendance/actions.ts:17-29"],
      },
      {
        q: "Can the company maintain a holiday calendar?",
        a: "TalentOS has a company-wide Holiday Calendar, and its screen says holidays are excluded from working-day counts in attendance and leave.",
        evidence: ["src/app/(products)/talentos/(protected)/holidays/page.tsx:10-23"],
      },
      {
        q: "Can leave balances and request history be viewed by employees?",
        a: "The My Leave page loads leave balances, request history and configured leave types for the signed-in employee.",
        evidence: ["src/app/(products)/talentos/(protected)/me/leave/page.tsx:11-27,33-58"],
      },
      {
        q: "Can employees request leave from TalentOS?",
        a: "The My Leave page opens the employee leave request form with the available leave types.",
        evidence: ["src/app/(products)/talentos/(protected)/me/leave/page.tsx:25-27"],
      },
      {
        q: "Can a manager approve or reject a leave request?",
        a: "TalentOS provides a decision action for approving or rejecting requests; approval can be blocked when the request month has finalized payroll.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/leave/actions.ts:87-103"],
      },
      {
        q: "Can leave requests be cancelled?",
        a: "A separate leave action cancels a request and records the cancellation.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/leave/actions.ts:114-129"],
      },
      {
        q: "Can HR search leave requests by status or leave type?",
        a: "The staff Leave screen accepts status and leave-type filters, and returns a paginated list.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/leave/page.tsx:31-62,80-114"],
      },
      {
        q: "Can managers see leave only for their reporting scope?",
        a: "When the user is restricted to particular employees, the Leave page applies that employee scope to the request search and employee filters.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/leave/page.tsx:45,62,69"],
      },
      {
        q: "Does TalentOS track leave allocation?",
        a: "Staff leave actions include a leave-allocation update, while the employee view shows leave balances by type.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/leave/actions.ts:136", "src/app/(products)/talentos/(protected)/me/leave/page.tsx:16-33"],
      },
      {
        q: "Can HR see the company's leave calendar and totals?",
        a: "The staff Leave page describes requests, balances and the leave calendar, and displays leave-type summary information.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/leave/page.tsx:80,146"],
      },
      {
        q: "Can TalentOS report on workforce trends?",
        a: "Its Workforce Overview and Analytics screens cover headcount, hiring, attendance, leave and workforce distribution.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/page.tsx:84-85,111-140,186-215", "src/app/(products)/talentos/(protected)/(staff)/analytics/page.tsx:125"],
      },
      {
        q: "Can employee analytics be filtered?",
        a: "The analytics page supports date range and filters including department, employment type, status and gender.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/analytics/page.tsx:65-71,103,113,141"],
      },
      {
        q: "Can HR track candidate offers in TalentOS?",
        a: "The Recruitment page tracks offers for shortlisted applicants and provides an offer status list.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/recruitment/page.tsx:23-25,66-90"],
      },
      {
        q: "Can an applicant be turned into an employee?",
        a: "Recruitment shows convertible applicants, and HR can open Add Employee with the selected application prefilled.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/recruitment/page.tsx:13,23-25,49-67"],
      },
      {
        q: "Can TalentOS create an offer from the recruitment screen?",
        a: "A recruiter action creates offers, and the action requires the recruitment permission.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/recruitment/actions.ts:18-25"],
      },
      {
        q: "Can an offer's status be changed?",
        a: "Yes. The recruitment action validates a requested offer status before updating it.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/recruitment/actions.ts:45-70"],
      },
      {
        q: "Can I edit the details of an existing offer?",
        a: "The recruitment actions include an offer-details update as well as a status update.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/recruitment/actions.ts:74-84"],
      },
      {
        q: "Can I see which applications have already produced offers?",
        a: "The recruitment page separates applicants who do not yet have an offer from the offer list.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/recruitment/page.tsx:23-25,80-90"],
      },
      {
        q: "Can payroll be calculated from attendance and leave?",
        a: "TalentOS documentation says payroll is computed from real attendance and leave; actual calculation depends on the company's payroll setup and recorded data.",
        evidence: ["docs/products.md:73-77"],
      },
      {
        q: "Can HR generate monthly payroll runs?",
        a: "The Payroll screen is for generating monthly runs, reviewing payslips and approval; disbursement is handled separately under Salary Payouts.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/payroll/page.tsx:13-25"],
      },
      {
        q: "Are payroll approval and salary payouts the same step?",
        a: "No. Payroll review and approval happen in Payroll, while salary disbursement is a separate Salary Payouts workflow.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/payroll/page.tsx:23-25"],
      },
      {
        q: "Can I list payroll runs?",
        a: "The Payroll page loads runs and displays their status and payslip counts.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/payroll/page.tsx:11-17,36-37"],
      },
      {
        q: "Can an employee review their own payslips?",
        a: "The employee self-service dashboard includes a Salary & payments section with payslip information.",
        evidence: ["src/app/(products)/talentos/(protected)/me/page.tsx:281-313"],
      },
      {
        q: "Can an employee open a particular month's salary details?",
        a: "TalentOS has a month-specific employee salary route as well as a salary overview page.",
        evidence: ["src/app/(products)/talentos/(protected)/me/salary/page.tsx:1-20", "src/app/(products)/talentos/(protected)/me/salary/[month]/page.tsx:1-20"],
      },
      {
        q: "Can payslips be downloaded as PDFs?",
        a: "TalentOS exposes a payslip PDF endpoint for a specific payslip.",
        evidence: ["src/app/(products)/api/talentos/payslips/[id]/pdf/route.ts:1-20"],
      },
      {
        q: "Can HR review salary payout status separately from payroll runs?",
        a: "Salary Payouts lists disbursements with month, status, department and search filters.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/payroll/payouts/page.tsx:24-25,37,51-63"],
      },
      {
        q: "Which payout states can a salary payment move through?",
        a: "Payout state transitions include pending, initiated, processing, paid, failed and cancelled, with allowed transitions checked by TalentOS.",
        evidence: ["src/lib/products/talentos/payout-status.ts:22-34"],
      },
      {
        q: "Can HR reconcile an employee's salary disbursement?",
        a: "The Salary Payouts screen is described as supporting initiation, tracking and reconciliation of employee salary disbursements.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/payroll/payouts/page.tsx:37"],
      },
      {
        q: "Can I export a payouts report?",
        a: "A payroll payout report endpoint is available for reporting disbursements.",
        evidence: ["src/app/(products)/api/talentos/payroll/payouts/report/route.ts:1-20"],
      },
      {
        q: "Can payroll settings reflect the company's own configuration?",
        a: "The TalentOS Settings screen exposes company, schedule, leave and payroll tabs, including configurable payroll values.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/settings/page.tsx:21,34,108-122"],
      },
      {
        q: "Can I configure the payroll financial-year start?",
        a: "The payroll settings form includes a financial-year start month field.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/settings/page.tsx:108-122"],
      },
      {
        q: "Can company payslip details be customized?",
        a: "TalentOS company settings include payslip company information and an optional payslip note.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/settings/page.tsx:34,67", "src/lib/products/talentos/company.ts:29-38"],
      },
      {
        q: "Are employee bank details restricted?",
        a: "TalentOS documents bank details as encrypted at rest, and its bank-account actions use dedicated bank permissions.",
        evidence: ["docs/products.md:77", "src/app/(products)/talentos/(protected)/(staff)/employees/[id]/bank-actions.ts:23-34"],
      },
      {
        q: "Can HR verify an employee bank account?",
        a: "TalentOS supports setting a bank-account verification status after validating that status.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/employees/[id]/bank-actions.ts:60-68"],
      },
      {
        q: "Can an employee maintain their own contact details?",
        a: "The employee self-service profile has an action for updating the employee's own contact information.",
        evidence: ["src/app/(products)/talentos/(protected)/me/profile/actions.ts:15"],
      },
      {
        q: "Can employees upload or review personal documents?",
        a: "TalentOS includes a My Documents area and actions for an employee to delete their own document.",
        evidence: ["src/app/(products)/talentos/(protected)/me/documents/page.tsx:1-30", "src/app/(products)/talentos/(protected)/me/documents/actions.ts:14"],
      },
      {
        q: "Can HR track documents nearing expiry?",
        a: "TalentOS can list expiring employee documents, and its notification types include document-expiry reminders.",
        evidence: ["src/lib/products/talentos/documents.ts:163-163", "src/app/(products)/talentos/(protected)/notifications/page.tsx:26"],
      },
      {
        q: "Can employees see payroll and leave notifications?",
        a: "TalentOS notification types include leave decisions, published payslips, salary-paid and payout-failed events.",
        evidence: ["src/lib/products/talentos/notifications.ts:22-34"],
      },
      {
        q: "Can the company import employee records?",
        a: "CommandOS offers an employee CSV import with a preview before saving; the import requires Director access.",
        evidence: ["src/app/(products)/commandos/(protected)/settings/import/page.tsx:23-26", "src/app/(products)/commandos/(protected)/settings/import/run/route.ts:17-20"],
      },
      {
        q: "Can TalentOS notify HR about new joiners?",
        a: "The TalentOS notification screen covers new joiners, leave requests, document expiry, birthdays and probation reminders.",
        evidence: ["src/app/(products)/talentos/(protected)/notifications/page.tsx:26"],
      },
      {
        q: "Can payroll changes be audited?",
        a: "TalentOS documents audit logging for sensitive changes, including status, salary and roles.",
        evidence: ["docs/products.md:77"],
      },
      {
        q: "Can managers approve leave without considering payroll close?",
        a: "No. An approval attempt is blocked for a leave month whose payroll has been finalized.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/leave/actions.ts:87-93"],
      },
      {
        q: "Can I see hiring and attendance trends together?",
        a: "Workforce Overview includes headcount, hiring, attendance and leave, while Analytics offers deeper hiring and employee metrics.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/page.tsx:84-85,131-140", "src/app/(products)/talentos/(protected)/(staff)/analytics/page.tsx:125"],
      },
      {
        q: "Do TalentOS screens use employee permissions?",
        a: "Yes. Screen actions and data scope depend on TalentOS roles and manager permissions; for example, attendance distinguishes edit access from overview-only access.",
        evidence: ["src/app/(products)/talentos/(protected)/(staff)/attendance/page.tsx:18-19,40-41", "docs/products.md:74-77"],
      },
    ],
  },
];
