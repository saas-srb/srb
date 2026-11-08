import type { WorkflowInput } from "@/lib/platform/workflows/shared";

/** Ready-made automations offered on /commandos/settings/automations — client-safe. */
export interface WorkflowTemplate {
  key: string;
  title: string;
  description: string;
  /** `adminEmail` is the Director adding it — the starting recipient for email templates (editable afterwards). */
  build(adminEmail: string): WorkflowInput;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: "lead-notify-sales",
    title: "New lead → notify sales",
    description: "Everyone with the CRM Manager role gets a notification when a lead comes in.",
    build: () => ({
      name: "New lead → notify sales",
      enabled: true,
      trigger: "lead.created",
      conditions: [],
      actions: [{ type: "notify", target: "role", value: "lms_manager", title: "New lead: {{name}}", body: "{{email}} · {{phone}}" }],
    }),
  },
  {
    key: "invoice-paid-email-finance",
    title: "Invoice paid → email finance",
    description: "Sends an email when an invoice is fully paid. Starts with your address; change it to your finance inbox.",
    build: (adminEmail) => ({
      name: "Invoice paid → email finance",
      enabled: true,
      trigger: "invoice.paid",
      conditions: [],
      actions: [{ type: "email", to: adminEmail, subject: "Invoice {{invoiceNumber}} is paid", body: "{{customerName}} has paid invoice {{invoiceNumber}} ({{currency}} {{totalAmount}})." }],
    }),
  },
  {
    key: "task-completed-notify-pm",
    title: "Task completed → notify project managers",
    description: "Project managers get a notification when a task is marked done.",
    build: () => ({
      name: "Task completed → notify project managers",
      enabled: true,
      trigger: "task.completed",
      conditions: [],
      actions: [{ type: "notify", target: "role", value: "pms_manager", title: "Task completed: {{title}}", body: "{{taskCode}} was marked done by {{actorEmail}}." }],
    }),
  },
  {
    key: "leave-requested-notify-hr",
    title: "Leave requested → notify HR",
    description: "HR gets a notification for every new leave request.",
    build: () => ({
      name: "Leave requested → notify HR",
      enabled: true,
      trigger: "leave.requested",
      conditions: [],
      actions: [{ type: "notify", target: "role", value: "hr", title: "Leave request: {{label}}", body: "{{days}} day(s), {{startDate}} to {{endDate}}." }],
    }),
  },
];

export function findTemplate(key: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.key === key);
}
