/**
 * Plain-language names and descriptions for the notification events, by event key. The keys themselves carry the products' old short names
 * (`dlms_`, `lms_`, `fms_` …); nothing the company sees is built from them. An event that is not listed here (a new one) is named from its
 * key with that prefix removed (see `eventName`), and the product it belongs to is shown by the product's current name.
 */
const N: Record<string, [name: string, description: string]> = {
  // AI bots
  aibots_bot_access: ["Bot shared with you", "A person is given access to an AI bot."],
  aibots_bot_created: ["Bot created", "A new AI bot is created."],
  aibots_bot_deleted: ["Bot deleted", "An AI bot and its knowledge files are removed."],
  aibots_bot_status: ["Bot switched on or off", "An AI bot is paused or made available again."],
  aibots_file_failed: ["Knowledge file failed", "A file added to a bot's knowledge could not be processed."],
  aibots_file_ready: ["Knowledge file ready", "A file added to a bot's knowledge is ready to use."],
  // Website
  cms_ai_website_failed: ["AI website failed", "The AI-written website could not be generated."],
  cms_ai_website_ready: ["AI website ready", "The AI-written website has been generated."],
  cms_campaign_ending: ["Offer campaign ending", "An offer campaign is about to end."],
  cms_chat_visitor: ["Visitor started a chat", "Someone starts chatting on your website."],
  cms_coupon_expiring: ["Coupon expiring", "A coupon is about to expire."],
  cms_coupon_used_up: ["Coupon fully used", "A coupon has reached its usage limit."],
  cms_kb_failed: ["Chatbot knowledge update failed", "The website chatbot's knowledge could not be updated."],
  cms_kb_indexed: ["Chatbot knowledge updated", "The website chatbot's knowledge was updated."],
  cms_maintenance_off: ["Maintenance mode turned off", "The website is visible to visitors again."],
  cms_maintenance_on: ["Maintenance mode turned on", "Visitors see the maintenance page instead of the website."],
  cms_offer_claimed: ["Offer claimed", "A visitor claims one of your offers."],
  cms_page_deleted: ["Page deleted", "A website page and its history are removed."],
  cms_page_published: ["Page published", "A website page goes live."],
  cms_push_failed: ["Website push failed", "A push notification to website visitors could not be delivered."],
  cms_push_sent: ["Website push sent", "A push notification was sent to website visitors."],
  cms_record_published: ["Content published", "A blog post, case study or other record goes live."],
  cms_referrals_waiting: ["Referrals waiting", "Referrals are waiting for a decision."],
  manual_adjustment: ["Wallet adjustment", "A wallet balance is adjusted by hand."],
  offer_status: ["Offer status changed", "The status of a claimed offer changes."],
  referral_bonus_referee: ["Referral bonus received", "A referred person receives their bonus."],
  // CyberVault
  dlms_access: ["Vault access changed", "A person's access to client vaults is updated."],
  dlms_expiry: ["Credential or document expiring", "A stored credential or document has expired or is about to."],
  dlms_record_added: ["Record added", "A credential, document, link or note is added to a vault."],
  dlms_record_archived: ["Record archived or restored", "A vault record is archived or brought back."],
  dlms_record_deleted: ["Record deleted", "A vault record is deleted."],
  dlms_reveal: ["Password revealed or copied", "Someone reveals or copies a stored password."],
  // CashFlow
  fms_advance_requested: ["Advance requested", "An employee advance needs approval."],
  fms_advance_status: ["Advance status changed", "An employee advance is approved, rejected or paid."],
  fms_approval_needed: ["Approval needed", "A transaction needs approval."],
  fms_asset_disposed: ["Asset disposal recorded", "A company asset is written off or sold."],
  fms_bills_overdue: ["Bills overdue", "Bills to pay are past their due date."],
  fms_filings_due_soon: ["Filing due soon", "A return or form on the filing calendar falls due within 7 days."],
  fms_work_overdue: ["Work overdue", "Pieces of work in My work are past their due date and not done."],
  fms_work_due_today: ["Work due today", "Pieces of work in My work fall due today."],
  fms_filings_overdue: ["Filing overdue", "A return or form on the filing calendar is past its due date and not marked filed."],
  fms_fund_transfer: ["Fund transfer", "Money is moved between your accounts."],
  fms_invoice_created: ["Invoice created", "A customer invoice is created."],
  fms_invoice_paid: ["Invoice paid", "A customer invoice is paid in full."],
  fms_invoices_due_soon: ["Invoices due soon", "Customer invoices fall due in the next few days."],
  fms_invoices_overdue: ["Invoices overdue", "Customer invoices are past their due date."],
  fms_payment_received: ["Payment received", "A customer payment is recorded."],
  fms_receipt_voided: ["Receipt voided", "A payment receipt is cancelled."],
  fms_reconciliation_flag: ["Bank line flagged", "A bank statement line is flagged during reconciliation."],
  fms_refund_requested: ["Refund requested", "A customer refund needs a decision."],
  fms_refund_status: ["Refund status changed", "A customer refund is approved, rejected or paid."],
  // TalentOS (HR)
  birthday_today: ["Birthday today", "A teammate has a birthday."],
  document_expiring: ["Employee document expiring", "An employee document is about to expire."],
  employee_added: ["Employee added", "A new employee is added."],
  leave_cancelled: ["Approved leave cancelled", "A leave that was approved is cancelled."],
  leave_decided: ["Leave decision", "A leave request is approved or rejected."],
  leave_request: ["Leave request", "A leave request is raised."],
  leave_requested: ["Leave requested", "An employee asks for leave."],
  payout_failed: ["Salary payout failed", "A salary payout could not be completed."],
  payroll_ready: ["Payroll ready for approval", "A month's payroll has been generated."],
  payslip_published: ["Payslip published", "An employee's payslip is ready."],
  probation_ending: ["Probation ending", "An employee's probation period is about to end."],
  salary_paid: ["Salary paid", "A month's salary is paid."],
  // DealFlow
  lms_application_new: ["New job application", "A candidate applies for a job."],
  lms_interview: ["Interview scheduled", "An interview is scheduled."],
  lms_lead_assigned: ["Lead assigned", "A lead or client is assigned to someone."],
  lms_lead_lost: ["Deal lost", "A deal is marked lost."],
  lms_lead_new: ["New lead", "A new lead arrives."],
  lms_lead_reply: ["Lead replied", "A lead replies to you."],
  lms_lead_won: ["Deal won", "A deal is marked won."],
  lms_stage_changed: ["Lead stage changed", "A lead moves to another stage."],
  lms_stale_applications: ["Applications waiting too long", "Job applications have had no action for too long."],
  lms_stale_leads: ["Leads waiting too long", "Leads have had no follow-up for too long."],
  // ContractFlow
  lpms_approval_needed: ["Document approval needed", "A document is waiting for your approval."],
  lpms_expired: ["Document expired", "A contract or document has expired."],
  lpms_expiring: ["Document expiring", "A contract or document is about to expire."],
  lpms_published: ["Document published", "A document is published."],
  lpms_review_requested: ["Review requested", "Someone asks you to review a document."],
  lpms_signature_requested: ["Signatures requested", "A document is sent for signature."],
  // Huddle
  channel_invite: ["Meeting invitation", "You are invited to a meeting."],
  file_shared: ["File shared", "A file is shared with you in chat."],
  project_update: ["Project update in chat", "A linked project changes."],
  task_linked: ["Task linked to a chat", "A task is linked to a conversation."],
  // EvalIQ
  ots_assigned: ["Test assigned", "A test is assigned to a candidate."],
  ots_cancelled_alert: ["Test cancelled", "A test assignment is cancelled."],
  ots_certificate: ["Certificate issued", "A certificate is issued after a test."],
  ots_certificate_restored: ["Certificate valid again", "A revoked certificate is restored."],
  ots_certificate_revoked_alert: ["Certificate revoked", "A certificate is revoked."],
  ots_completed: ["Test submitted", "A candidate submits a test."],
  ots_due_soon: ["Test due soon", "A test is about to reach its deadline."],
  ots_evaluation_needed: ["Answers to evaluate", "Answers are waiting for manual marking."],
  ots_expired: ["Test expired", "A test window closed before it was started."],
  ots_extra_attempt: ["Extra attempt added", "A candidate is given another attempt."],
  ots_result: ["Result available", "A test result is published."],
  ots_starting: ["Test opening soon", "A test is about to open."],
  ots_updated: ["Test schedule changed", "A test's schedule is changed."],
  // SprintOS
  added_to_project: ["Added to a project", "You are added to a project."],
  deadline_approaching: ["Task due soon", "A task is about to reach its due date."],
  milestone_completed: ["Milestone completed", "A project milestone is completed."],
  project_status_changed: ["Project status changed", "A project moves to a new status."],
  task_assigned: ["Task assigned", "A task is assigned to someone."],
  task_completed: ["Task completed", "A task is marked done."],
  timesheet_reviewed: ["Timesheet reviewed", "A timesheet is approved or rejected."],
  timesheet_submitted: ["Timesheet submitted", "A timesheet is waiting for your review."],
  // SpendIQ
  asset_assigned: ["Asset assigned", "A company asset is assigned to someone."],
  budget_overspent: ["Budget overspent", "A budget has been exceeded."],
  expense_approved: ["Expense approved", "An expense claim is approved."],
  expense_reimbursed: ["Expense reimbursed", "An approved expense is paid out."],
  expense_rejected: ["Expense rejected", "An expense claim is rejected."],
  expense_submitted: ["Expense submitted", "An expense claim is waiting for approval."],
  invoice_paid: ["Vendor invoice paid", "A vendor invoice is paid in full."],
  invoices_overdue: ["Vendor invoices overdue", "Vendor invoices are past their due date."],
  low_stock: ["Low stock", "Inventory is at or below its minimum."],
  po_cancelled_alert: ["Purchase order status changed", "A purchase order is cancelled or closed."],
  po_issued: ["Purchase order issued", "A purchase order is sent to a vendor."],
  recurring_expenses_generated: ["Recurring expenses generated", "Recurring expenses are created for approval."],
  requisition_approved: ["Requisition approved", "A purchase requisition is approved."],
  requisition_high_value_approved: ["High-value requisition approved", "A large purchase requisition is approved."],
  requisition_progress: ["Requisition progress", "A purchase requisition moves forward."],
  requisition_rejected: ["Requisition rejected", "A purchase requisition is rejected."],
  requisition_submitted: ["Requisition submitted", "A purchase requisition is waiting for approval."],
  resource_renewal: ["Renewal due", "A subscription or resource is due to renew."],
  // RankMax
  seo_audit_completed: ["Website audit finished", "A website audit completes."],
  seo_audit_failed: ["Website audit failed", "A scheduled website audit did not finish."],
  seo_issue_assigned: ["SEO issue assigned", "An SEO issue is assigned to someone."],
  seo_ranking_drop: ["Ranking drop", "Keywords drop in the search rankings."],
  seo_task_assigned: ["SEO task assigned", "An SEO task is assigned to someone."],
  seo_task_updated: ["SEO task updated", "An SEO task changes status."],
  // ViralPulse
  smms_approval_needed: ["Post due, not approved", "A scheduled post is due but has not been approved."],
  smms_approval_withdrawn: ["Approval withdrawn", "Approval for a scheduled post is taken back."],
  smms_integration_disconnected: ["Social account disconnected", "A connected social account is disconnected."],
  smms_integration_error: ["Social account needs attention", "A connected social account reports a problem."],
  smms_post_approved: ["Post approved", "A scheduled post is approved to publish."],
  smms_publish_due: ["Ad due to go live", "An ad is due to go live."],
  smms_publish_failed: ["Publishing failed", "A post could not be published."],
  smms_published: ["Post published", "A post is published."],
  // PlayBook
  sop_assigned: ["Procedure assigned", "A procedure is assigned to someone to read and acknowledge."],
  sop_doc_approved: ["Document approved", "A document you wrote is approved."],
  sop_doc_issued: ["Document issued", "A document you wrote is issued and numbered."],
  sop_doc_rejected: ["Document sent back", "A document you submitted is sent back with a reason."],
  sop_doc_review_requested: ["Document approval needed", "A document is waiting for your approval."],
  sop_expiring: ["Procedure expired", "A procedure has passed its expiry date."],
  sop_feedback: ["Procedure feedback", "Someone sends feedback or a change request on a procedure."],
  sop_overdue: ["Acknowledgement overdue", "A procedure was not acknowledged by its due date."],
  sop_reminder: ["Acknowledgement reminder", "A procedure is due to be acknowledged soon."],
  sop_review_due: ["Procedure review due", "A procedure is due for its periodic review."],
  sop_updated: ["Procedure updated", "A new version of a procedure is published."],
  // Help & Support
  support_request: ["Support request", "A support request is raised."],
  support_update: ["Support update", "A support request gets an update."],
  // CohortAI
  assignment_posted: ["Assignment posted", "A new assignment is posted for students."],
  batch_assigned: ["Added to a batch", "A student is added to a batch."],
  certificate_issued: ["Certificate issued", "A certificate is issued to a student."],
  certificate_reinstated: ["Certificate reinstated", "A revoked certificate is valid again."],
  certificate_reissued: ["Certificate reissued", "A certificate is reissued with a new number."],
  certificate_revoked_alert: ["Certificate revoked", "A student's certificate is revoked."],
  class_reminder: ["Class reminder", "A class is happening tomorrow."],
  class_scheduled: ["Class scheduled", "A class is scheduled."],
  fees_pending: ["Fees pending", "Fee plans have an outstanding balance."],
  // Account, billing and announcements
  auth_verify_email: ["Verify your email", "Sent to a new account to confirm its email address."],
  auth_password_reset: ["Password reset", "The link sent when someone asks to reset a forgotten password."],
  auth_email_otp: ["Sign-in code by email", "The one-time code for two-step sign-in by email."],
  team_invitation: ["Team invitation", "Sent when you invite someone to join the workspace."],
  billing_invoice: ["Invoices & receipts", "Tax invoices and payment receipts for your subscription."],
  billing_trial: ["Trial reminders", "Reminders that the free trial is about to end."],
  billing_subscription: ["Subscription notices", "Payment failures, renewals, plan changes and suspension notices."],
  announcement: ["Announcements", "Messages you send from the Announcements tab."],
  // Workspace
  automation_notification: ["Automation notifications", "Notifications and emails your own automations send."],
  comment_added: ["New comment", "Someone comments on a task."],
  document_request: ["Document requested", "A document is requested from someone."],
  document_uploaded: ["Document uploaded", "A document is uploaded."],
  payment_recorded: ["Payment received", "A payment is recorded."],
  status_update: ["Status updated", "The status of a request changes."],
  workspace_event: ["Workspace event", "Something happens in the workspace."],
};

/** The prefixes that used to name a product inside event keys; dropped when an event has no entry above. */
const OLD_PREFIX = /^(aibots|cms|dlms|fms|hrms|lms|lpms|ots|pms|prms|seo|smms|sop|tms|portal|messenger)_/;

const humanize = (s: string) => {
  const t = s.replace(/[_.-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : s;
};

/** What a notification event is called: the written name, else its key without the old product prefix. */
export function eventName(key: string): string {
  return N[key]?.[0] ?? humanize(key.replace(OLD_PREFIX, ""));
}

export function eventDescription(key: string): string {
  const hit = N[key];
  return hit ? hit[1] : `Sent when: ${eventName(key).toLowerCase()}.`;
}
