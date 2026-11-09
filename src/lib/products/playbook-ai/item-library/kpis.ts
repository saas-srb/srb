import type { KpiSpec } from "@/lib/products/playbook-ai/item-library/build";

const T = "Company to set";

/** Defaults shared by every sheet; each role only supplies what is specific to it. */
export const KPI_DEFAULTS: Pick<KpiSpec, "cadence" | "scale" | "improvement"> = {
  cadence: [
    "Weekly check-in between the employee and the reporting manager on progress against each indicator.",
    "Monthly review of the data sources and a short written note on results and blockers.",
    "Formal review at the end of the review period, with the rating recorded by the reporting manager and acknowledged by the employee.",
  ],
  scale: [
    "5 | Outstanding: results clearly exceed the agreed target on most indicators.",
    "4 | Exceeds expectations: results are above target on key indicators.",
    "3 | Meets expectations: results meet the agreed targets.",
    "2 | Needs improvement: results are below target on important indicators.",
    "1 | Unsatisfactory: results are well below target and need immediate action.",
  ],
  improvement: [
    "Where the rating is 2 or lower, the manager and employee write a plan naming the indicators to improve, the actions, the support needed and the review date.",
    "Progress against the plan is reviewed at each weekly check-in and recorded.",
    "If the plan's goals are met at its review date, it is closed; otherwise the manager decides the next step with HR under the company policy.",
  ],
};

type Row = [title: string, department: string, summary: string, purpose: string, kpis: string[]];

const ROLES: Row[] = [
  ["Sales Executive", "Sales", "Revenue, pipeline and conversion indicators for a field or inside sales role.", "Wins new business for {{company.name}} by finding, qualifying and closing opportunities while keeping accurate records.", [
    `Revenue achievement|Value of orders closed against the assigned target|Closed order value / assigned target x 100|${T}|35%|Monthly|CRM`,
    `Qualified pipeline|Opportunities that meet the qualification criteria|Number of qualified opportunities created|${T}|20%|Monthly|CRM`,
    `Lead-to-order conversion|Share of qualified opportunities that become orders|Orders won / qualified opportunities x 100|${T}|20%|Quarterly|CRM`,
    `Activity discipline|Calls, meetings and follow-ups logged on time|Logged activities / planned activities x 100|${T}|15%|Weekly|CRM`,
    `Data quality|CRM records complete and current|Complete records / records reviewed x 100|${T}|10%|Monthly|CRM audit`]],
  ["Account Manager", "Sales and Account Management", "Retention, growth and satisfaction of an assigned client portfolio.", "Keeps the clients of {{company.name}} satisfied and growing by managing relationships and delivery of promises.", [
    `Client retention|Clients renewed or continuing in the period|Retained clients / clients due x 100|${T}|30%|Quarterly|CRM and contracts`,
    `Account growth|Increase in billed value from existing clients|(Current billing - previous billing) / previous billing x 100|${T}|25%|Quarterly|Finance records`,
    `Client satisfaction|Score given by clients in feedback|Average score of client feedback|${T}|20%|Quarterly|Feedback survey`,
    `Issue closure|Client issues resolved in the agreed time|Issues closed on time / issues raised x 100|${T}|15%|Monthly|Ticket system`,
    `Review cadence|Planned client reviews held|Reviews held / reviews planned x 100|${T}|10%|Quarterly|Calendar and minutes`]],
  ["Business Development Manager", "Sales", "New markets, partnerships and large opportunities.", "Opens new markets and partnerships for {{company.name}} and builds the pipeline for large deals.", [
    `New business revenue|Value from new clients or markets|Closed value from new clients / target x 100|${T}|35%|Quarterly|CRM`,
    `Strategic pipeline|Large opportunities in the qualified pipeline|Number and value of qualified large opportunities|${T}|25%|Monthly|CRM`,
    `Partnership outcomes|Active partners contributing business|Partners with closed business / partners signed|${T}|15%|Quarterly|Partner tracker`,
    `Proposal quality|Proposals approved at first review|Proposals approved first time / proposals sent x 100|${T}|15%|Quarterly|Proposal log`,
    `Market intelligence|Written market insights shared with the team|Insight notes shared in the period|${T}|10%|Quarterly|Shared folder`]],
  ["Software Engineer", "Engineering", "Delivery, quality and collaboration indicators for an engineering role.", "Builds, tests and maintains software for {{company.name}} that meets requirements and is reliable and maintainable.", [
    `Delivery against commitments|Sprint or task commitments completed|Completed committed items / committed items x 100|${T}|30%|Sprint|Project tool`,
    `Code quality|Defects found after review or release in the engineer's work|Defects per delivered item|${T}|25%|Monthly|Issue tracker`,
    `Review participation|Code reviews completed for teammates in time|Reviews completed on time / reviews assigned x 100|${T}|15%|Monthly|Repository`,
    `Technical documentation|Work items with up-to-date documentation|Documented items / delivered items x 100|${T}|10%|Monthly|Wiki`,
    `Production reliability|Incidents caused by the engineer's changes|Count of incidents attributed to changes|${T}|20%|Quarterly|Incident log`]],
  ["QA Engineer", "Engineering", "Test coverage, defect detection and release quality.", "Protects product quality at {{company.name}} by planning and running tests and reporting defects clearly.", [
    `Test coverage|Requirements covered by written test cases|Requirements with tests / total requirements x 100|${T}|25%|Release|Test management tool`,
    `Defect detection|Defects found before release|Defects found before release / all defects found x 100|${T}|30%|Release|Issue tracker`,
    `Defect report quality|Defects reproducible from the report without questions|Reproducible reports / reports raised x 100|${T}|15%|Monthly|Issue tracker`,
    `Test execution on time|Planned test runs completed on schedule|Runs completed on time / runs planned x 100|${T}|20%|Release|Test plan`,
    `Automation contribution|Regression cases automated|Automated cases added in the period|${T}|10%|Quarterly|Repository`]],
  ["DevOps Engineer", "Engineering and IT", "Reliability, deployment and security of infrastructure.", "Keeps the platforms of {{company.name}} reliable, secure and quick to deploy.", [
    `Service availability|Time the services are available|Available minutes / total minutes x 100|${T}|30%|Monthly|Monitoring`,
    `Deployment success|Deployments that need no rollback|Successful deployments / all deployments x 100|${T}|20%|Monthly|Pipeline`,
    `Incident response|Incidents responded to within the target|Incidents responded in time / incidents x 100|${T}|20%|Monthly|Incident log`,
    `Backup and restore assurance|Restore tests passed|Passed tests / tests run x 100|${T}|15%|Quarterly|Test records`,
    `Security fixes|Critical vulnerabilities fixed within the policy time|Fixed in time / identified x 100|${T}|15%|Monthly|Scanner reports`]],
  ["Product Manager", "Product", "Outcomes, delivery and stakeholder alignment for a product.", "Decides what is built for {{company.name}} and why, and ensures the team delivers outcomes users value.", [
    `Roadmap delivery|Roadmap items delivered in the committed period|Delivered items / committed items x 100|${T}|25%|Quarterly|Roadmap tool`,
    `Product adoption|Usage of the features released|Active users of released features|${T}|25%|Monthly|Analytics`,
    `Customer feedback loop|Customer interviews or feedback reviews held|Sessions held in the period|${T}|15%|Quarterly|Research log`,
    `Requirement clarity|Stories accepted by the team without rework|Stories accepted first time / stories written x 100|${T}|20%|Sprint|Project tool`,
    `Stakeholder satisfaction|Rating by engineering, sales and support|Average stakeholder rating|${T}|15%|Quarterly|Survey`]],
  ["UI/UX Designer", "Design", "Design quality, delivery and usability.", "Designs usable, consistent interfaces for {{company.name}} products and hands them over ready to build.", [
    `Design delivery|Design tasks delivered by the agreed date|Tasks on time / tasks assigned x 100|${T}|25%|Sprint|Project tool`,
    `Usability outcome|Task success in user testing of the designs|Participants completing the task / participants x 100|${T}|25%|Release|Test reports`,
    `Design consistency|Screens following the design system|Compliant screens / screens reviewed x 100|${T}|20%|Monthly|Design review`,
    `Rework after handover|Design changes requested after handover|Changes requested per delivered design|${T}|15%|Monthly|Project tool`,
    `Stakeholder feedback|Rating from product and engineering|Average rating|${T}|15%|Quarterly|Survey`]],
  ["Marketing Executive", "Marketing", "Campaign output, lead quality and brand activity.", "Builds awareness and demand for {{company.name}} through planned content and campaigns.", [
    `Qualified leads generated|Leads from campaigns that meet the criteria|Number of qualified leads attributed|${T}|30%|Monthly|CRM and analytics`,
    `Campaign delivery|Planned campaigns launched on schedule|Launched on time / planned x 100|${T}|20%|Monthly|Campaign calendar`,
    `Content output|Approved content pieces published|Pieces published against the calendar|${T}|20%|Monthly|Content calendar`,
    `Engagement|Engagement on owned channels|Engagements / reach x 100|${T}|15%|Monthly|Analytics`,
    `Budget discipline|Spend within the approved campaign budget|Actual spend / approved budget x 100|${T}|15%|Monthly|Finance records`]],
  ["HR Executive", "Human Resources", "Employee lifecycle service, records and policy compliance.", "Supports employees of {{company.name}} through the lifecycle and keeps HR records accurate and compliant.", [
    `Employee query resolution|Queries resolved within the service time|Resolved in time / received x 100|${T}|25%|Monthly|HR ticket log`,
    `Record accuracy|HR records found correct in audit|Correct records / records audited x 100|${T}|25%|Quarterly|HR audit`,
    `Onboarding completion|Joiners with a complete checklist in the first week|Complete checklists / joiners x 100|${T}|20%|Monthly|Onboarding tracker`,
    `Statutory and policy timeliness|HR filings and policy tasks completed by due date|On-time tasks / tasks due x 100|${T}|20%|Monthly|Compliance calendar`,
    `Employee feedback|Satisfaction with HR service|Average feedback score|${T}|10%|Quarterly|Survey`]],
  ["Recruiter", "Human Resources", "Hiring speed, quality and candidate experience.", "Fills open positions at {{company.name}} with suitable people quickly and fairly.", [
    `Time to fill|Days from approved requisition to accepted offer|Average days to accepted offer|${T}|25%|Monthly|ATS`,
    `Quality of hire|New hires rated as meeting expectations after probation|Hires meeting expectations / hires reviewed x 100|${T}|30%|Quarterly|Probation reviews`,
    `Offer acceptance|Offers accepted by candidates|Offers accepted / offers made x 100|${T}|15%|Monthly|ATS`,
    `Candidate experience|Candidate feedback on the process|Average candidate rating|${T}|15%|Quarterly|Survey`,
    `Process compliance|Hires with complete records and checks|Complete files / hires x 100|${T}|15%|Monthly|HR audit`]],
  ["Accountant", "Finance", "Accuracy, timeliness and compliance of accounting.", "Keeps the books of {{company.name}} accurate, timely and ready for review and filing.", [
    `Month-end close timeliness|Days to complete the monthly close|Working days from month end to lock|${T}|25%|Monthly|Close checklist`,
    `Reconciliation completeness|Accounts reconciled with differences explained|Reconciled accounts / accounts due x 100|${T}|25%|Monthly|Reconciliations`,
    `Posting accuracy|Entries needing correction after review|Corrected entries / entries reviewed x 100|${T}|20%|Monthly|Review notes`,
    `Statutory filing timeliness|Returns and filings made by the due date|On-time filings / filings due x 100|${T}|20%|Monthly|Compliance calendar`,
    `Audit observations|Open observations from internal or external audit|Number of open observations|${T}|10%|Annual|Audit reports`]],
  ["Accounts Receivable Executive", "Finance", "Invoicing accuracy and collection performance.", "Bills customers of {{company.name}} correctly and collects dues on time.", [
    `Collection efficiency|Collections against amounts due|Collected / due x 100|${T}|30%|Monthly|Ledger`,
    `Overdue receivables|Share of receivables past due|Overdue amount / total receivables x 100|${T}|25%|Monthly|Ageing report`,
    `Invoice accuracy|Invoices issued without correction|Invoices not corrected / invoices issued x 100|${T}|20%|Monthly|Invoice register`,
    `Follow-up discipline|Reminders sent on schedule|Reminders sent / reminders due x 100|${T}|15%|Weekly|Collection log`,
    `Dispute resolution|Disputes resolved within the target time|Resolved in time / disputes x 100|${T}|10%|Monthly|Dispute log`]],
  ["Customer Support Agent", "Customer Support", "Responsiveness, resolution and customer satisfaction.", "Resolves customer requests for {{company.name}} accurately, promptly and courteously.", [
    `First response time|Share of tickets answered within the target|Tickets answered in time / tickets x 100|${T}|20%|Weekly|Ticket system`,
    `Resolution time|Share of tickets resolved within the target|Resolved in time / tickets x 100|${T}|25%|Weekly|Ticket system`,
    `Customer satisfaction|Rating customers give after closure|Average satisfaction score|${T}|25%|Monthly|Survey`,
    `First-contact resolution|Tickets resolved without referral or reopening|Resolved first time / tickets x 100|${T}|15%|Monthly|Ticket system`,
    `Quality review score|Score from sampled ticket reviews|Average review score|${T}|15%|Monthly|Quality review`]],
  ["Project Manager", "Operations", "Schedule, scope, quality and client satisfaction of projects.", "Delivers projects for {{company.name}} on scope, schedule and budget with clear communication.", [
    `Schedule adherence|Milestones delivered by the baseline date|Milestones on time / milestones due x 100|${T}|25%|Monthly|Project plan`,
    `Budget adherence|Effort or cost against the approved budget|Actual / approved x 100|${T}|20%|Monthly|Finance and time records`,
    `Deliverable quality|Deliverables accepted at first review|Accepted first time / delivered x 100|${T}|20%|Monthly|Review log`,
    `Client satisfaction|Rating from the client at milestones and closure|Average client rating|${T}|20%|Per project|Survey`,
    `Risk and change control|Risks and changes recorded and handled in time|Handled in time / raised x 100|${T}|15%|Monthly|RAID and change logs`]],
  ["Operations Manager", "Operations", "Service levels, productivity and cost of operations.", "Runs day-to-day operations at {{company.name}} to meet service levels efficiently and safely.", [
    `Service level achievement|Operations meeting the agreed service levels|Service levels met / total x 100|${T}|30%|Monthly|Operations dashboard`,
    `Productivity|Output per person or per hour of the team|Output / effort|${T}|20%|Monthly|Operations records`,
    `Process compliance|Audited processes found compliant|Compliant checks / checks x 100|${T}|20%|Quarterly|Audit reports`,
    `Cost control|Operating cost against budget|Actual / budget x 100|${T}|15%|Monthly|Finance records`,
    `Team capability|Team members trained on their key processes|Trained / team size x 100|${T}|15%|Quarterly|Training records`]],
  ["Procurement Executive", "Procurement", "Cost, speed and compliance in buying.", "Buys what {{company.name}} needs at fair value through a compliant and documented process.", [
    `Cost savings|Saving against first quotes or budget|(First quote - final price) / first quote x 100|${T}|25%|Quarterly|Quote comparisons`,
    `Order turnaround|Days from approved requisition to purchase order|Average days|${T}|20%|Monthly|Procurement system`,
    `Process compliance|Purchases with approved requisition and order|Compliant purchases / purchases x 100|${T}|25%|Monthly|Audit sample`,
    `Supplier delivery performance|Orders delivered on time and complete|On-time complete orders / orders x 100|${T}|20%|Monthly|Receipt records`,
    `Vendor records|Vendor master records complete and verified|Complete records / records reviewed x 100|${T}|10%|Quarterly|Vendor master`]],
  ["IT Support Engineer", "Information Technology", "Resolution, uptime and asset control for end users.", "Keeps employees of {{company.name}} productive by resolving IT issues and maintaining devices and access.", [
    `Ticket resolution time|Tickets resolved within the target|Resolved in time / tickets x 100|${T}|30%|Weekly|Ticket system`,
    `User satisfaction|Rating after ticket closure|Average rating|${T}|20%|Monthly|Survey`,
    `Access request turnaround|Access requests completed within the target|Completed in time / requests x 100|${T}|20%|Monthly|Ticket system`,
    `Asset register accuracy|Assets correctly recorded at verification|Matching assets / assets checked x 100|${T}|15%|Yearly|Asset check`,
    `Patch compliance|Devices with current security updates|Updated devices / devices x 100|${T}|15%|Monthly|Management console`]],
  ["Administration Executive", "Administration", "Facilities, visitors, supplies and vendors for the offices.", "Keeps the offices of {{company.name}} safe, clean, well supplied and running smoothly.", [
    `Request turnaround|Facility requests closed within the target|Closed in time / requests x 100|${T}|30%|Monthly|Request log`,
    `Facility uptime|Working days without a facility disruption|Days without disruption / working days x 100|${T}|20%|Monthly|Incident log`,
    `Supply availability|Stock-outs of essential supplies|Number of stock-outs|${T}|15%|Monthly|Stock register`,
    `Visitor and access compliance|Visits with complete records|Complete records / visits x 100|${T}|20%|Monthly|Visitor log`,
    `Vendor service|Facility vendors rated satisfactory|Satisfactory ratings / ratings x 100|${T}|15%|Quarterly|Vendor review`]],
  ["Business Analyst", "Product and Operations", "Requirement quality, analysis and stakeholder outcomes.", "Turns business needs of {{company.name}} into clear requirements and evidence-based recommendations.", [
    `Requirement quality|Requirements accepted without major rework|Accepted first time / written x 100|${T}|30%|Sprint|Project tool`,
    `Analysis delivery|Analysis tasks delivered by the agreed date|On time / assigned x 100|${T}|25%|Monthly|Project tool`,
    `Stakeholder satisfaction|Rating by the people the analysis supports|Average rating|${T}|20%|Quarterly|Survey`,
    `Traceability|Requirements traced to tests and outcomes|Traced / total x 100|${T}|15%|Release|Requirements tool`,
    `Insight impact|Recommendations adopted by decision makers|Adopted / made x 100|${T}|10%|Quarterly|Decision log`]],
  ["Content Writer", "Marketing", "Quality, timeliness and effectiveness of written content.", "Writes accurate, clear and engaging content that serves the audience and goals of {{company.name}}.", [
    `On-time delivery|Pieces delivered by the agreed date|On time / assigned x 100|${T}|25%|Monthly|Content calendar`,
    `Editorial quality|Pieces approved with minor edits only|Approved with minor edits / pieces x 100|${T}|30%|Monthly|Editor review`,
    `Audience engagement|Reads or interactions with published pieces|Average engagement per piece|${T}|20%|Monthly|Analytics`,
    `Accuracy and compliance|Pieces without factual or compliance corrections|Clean pieces / pieces x 100|${T}|15%|Monthly|Review log`,
    `Search visibility|Pieces ranking for their target topic|Pieces in target ranking / pieces published|${T}|10%|Quarterly|Search tools`]],
  ["Data Analyst", "Analytics", "Accuracy, timeliness and usefulness of reports and analysis.", "Gives {{company.name}} accurate, timely analysis so decisions are based on data.", [
    `Report accuracy|Reports free of data errors on review|Error-free reports / reports x 100|${T}|30%|Monthly|Review log`,
    `Report timeliness|Scheduled reports delivered on time|On time / scheduled x 100|${T}|25%|Monthly|Report calendar`,
    `Analysis impact|Analyses that informed a documented decision|Analyses used / analyses delivered x 100|${T}|20%|Quarterly|Decision log`,
    `Data quality work|Data issues found and fixed at source|Issues fixed / issues found x 100|${T}|15%|Monthly|Issue tracker`,
    `Stakeholder satisfaction|Rating from report users|Average rating|${T}|10%|Quarterly|Survey`]],
  ["Quality Assurance Officer", "Quality", "Audit completion, corrective action closure and document control.", "Checks that work at {{company.name}} follows the approved procedures and that problems are corrected.", [
    `Audit plan completion|Planned audits completed|Audits done / audits planned x 100|${T}|30%|Quarterly|Audit programme`,
    `Corrective action closure|Actions closed by their due date|Closed on time / due x 100|${T}|25%|Monthly|Action register`,
    `Repeat findings|Findings that recur in later audits|Repeat findings / total findings x 100|${T}|20%|Quarterly|Audit reports`,
    `Document control|Documents reviewed on schedule|Reviewed on time / due x 100|${T}|15%|Quarterly|Master list`,
    `Training on procedures|Staff trained on changed procedures|Trained / affected x 100|${T}|10%|Quarterly|Training records`]],
  ["Team Lead", "Cross-functional", "Team results, people development and process discipline.", "Leads a team at {{company.name}} to deliver agreed results while developing its people.", [
    `Team target achievement|Team results against the agreed targets|Result / target x 100|${T}|30%|Monthly|Team dashboard`,
    `Team quality|Work from the team accepted without rework|Accepted first time / delivered x 100|${T}|20%|Monthly|Review records`,
    `People development|Team members with an agreed development plan and progress|Members with a plan and progress / members x 100|${T}|20%|Quarterly|Development plans`,
    `Team engagement and retention|Retention and engagement of the team|Employees retained / team size x 100|${T}|15%|Quarterly|HR records and survey`,
    `Process compliance|Team work following the standard procedures|Compliant checks / checks x 100|${T}|15%|Quarterly|Audit sample`]],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const KPI_SPECS: KpiSpec[] = ROLES.map(([title, department, summary, purpose, kpis]) => ({
  id: `kpi.${slug(title)}`, title, department, summary, purpose, kpis, ...KPI_DEFAULTS,
}));
