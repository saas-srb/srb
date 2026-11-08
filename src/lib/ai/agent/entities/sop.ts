import "server-only";
import { randomUUID } from "node:crypto";
import * as A from "@/app/(products)/playbook-ai/(protected)/actions";
import { sopCan, type SopPermission } from "@/lib/sop-roles";
import { requireViewer } from "@/lib/products/playbook-ai/viewer";
import { getReadableSop } from "@/lib/products/playbook-ai/sops";
import { CONFIDENTIALITY_LEVELS, SOP_PRIORITIES, SOP_STATUSES, type SopBlock, type SopSection } from "@/lib/products/playbook-ai/constants";
import { viaAction, f, fail, str, values } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, FieldDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * SOPs for the agent: create, write and publish procedures, assign them, collect acknowledgements and feedback, and manage the
 * department / function / process / category structure, templates and settings — through the product's own actions, so scope, confidentiality
 * and the audit trail are the product's.
 */

const ctx = (u: AgentUser) => ({ roles: u.roles, permissionOverrides: u.permissionOverrides });
const can = (p: SopPermission) => (u: AgentUser) => sopCan(ctx(u), p);
const PRIORITY = values(SOP_PRIORITIES); const CONF = values(CONFIDENTIALITY_LEVELS); const STATUS = values(SOP_STATUSES);
const soft = { deletedAt: null };

const act = (key: string, label: string, description: string, params: FieldDef[], perm: SopPermission, run: (v: Json, u: AgentUser) => Promise<unknown>, success: string, destructive = false): ActionDef => ({
  key, panel: "sop", label, description, params, level: "any", allow: can(perm), destructive, run: (v, u) => viaAction(() => run(v, u), success),
});

export const SOP_ENTITIES: EntityDef[] = [
  { key: "sop.document", panel: "sop", label: "SOP", description: "Standard operating procedures: code, title, department, owner, status (draft / published / active / expired / archived), version, review and expiry dates. Use sop.read for the text.", collection: "sops", idType: "string", baseFilter: soft, titleField: "title", search: ["title", "code", "tags"], read: "any", allowRead: can("VIEW"), hide: ["draft", "live", "accessUserIds"] },
  { key: "sop.version", panel: "sop", label: "SOP version", description: "Published versions of each SOP (version number, change type, summary, author, date).", collection: "sop_versions", idType: "string", search: ["code", "changeSummary"], read: "any", allowRead: can("VIEW"), hide: ["content"] },
  { key: "sop.department", panel: "sop", label: "SOP department", description: "Departments SOPs belong to.", collection: "sop_departments", idType: "string", baseFilter: soft, titleField: "name", read: "any" },
  { key: "sop.function", panel: "sop", label: "Function", description: "Business functions inside departments.", collection: "sop_functions", idType: "string", baseFilter: soft, titleField: "name", read: "any" },
  { key: "sop.process", panel: "sop", label: "Process", description: "Processes (and sub-processes) inside functions.", collection: "sop_processes", idType: "string", baseFilter: soft, titleField: "name", read: "any" },
  { key: "sop.category", panel: "sop", label: "SOP category", description: "Categories for organising SOPs.", collection: "sop_categories", idType: "string", baseFilter: soft, titleField: "name", read: "any" },
  { key: "sop.template", panel: "sop", label: "SOP template", description: "Templates new SOPs can start from.", collection: "sop_templates", idType: "string", baseFilter: soft, titleField: "name", read: "any" },
  { key: "sop.assignment", panel: "sop", label: "SOP assignment", description: "Who must read and acknowledge which SOP, due dates and acknowledgement status.", collection: "sop_assignments", idType: "string", read: "staff", self: (u) => ({ userId: u.id }) },
  { key: "sop.feedback", panel: "sop", label: "SOP feedback", description: "Feedback and change requests on SOPs.", collection: "sop_feedback", idType: "string", read: "staff" },
  { key: "sop.activity", panel: "sop", label: "Audit log", description: "Who changed what in SOP.", collection: "sop_activity_logs", idType: "string", search: ["entityLabel", "summary", "actorEmail"], read: "admin", allowRead: can("VIEW_AUDIT") },
];

const BLOCK_HELP = `Blocks: {type:"paragraph"|"note"|"warning"|"example"|"reference", text} · {type:"heading", text, level:2|3} · {type:"steps"|"bullets", items:[...]} · {type:"table", header:[...], rows:[[...]]} · {type:"checklist", title, items:[{text}]} · {type:"link", url, label, description}`;

function toBlock(raw: Json): SopBlock | null {
  const id = randomUUID();
  const t = String(raw.type ?? "paragraph");
  const text = typeof raw.text === "string" ? raw.text : "";
  const items = (Array.isArray(raw.items) ? raw.items : []).map((x) => (typeof x === "string" ? x : String((x as Json)?.text ?? ""))).filter(Boolean);
  switch (t) {
    case "paragraph": case "note": case "warning": case "example": case "reference": return text ? ({ id, type: t, text } as SopBlock) : null;
    case "heading": return text ? { id, type: "heading", text, level: raw.level === 3 ? 3 : 2 } : null;
    case "steps": case "bullets": return items.length ? ({ id, type: t, items } as SopBlock) : null;
    case "table": return { id, type: "table", header: (Array.isArray(raw.header) ? raw.header : []).map(String), rows: (Array.isArray(raw.rows) ? raw.rows : []).map((r) => (Array.isArray(r) ? r.map(String) : [])) };
    case "checklist": return items.length ? { id, type: "checklist", title: typeof raw.title === "string" ? raw.title : "Checklist", items: items.map((x) => ({ id: randomUUID(), text: x })) } : null;
    case "link": return typeof raw.url === "string" && raw.url ? { id, type: "link", url: raw.url, label: String(raw.label ?? raw.url), description: String(raw.description ?? "") } : null;
    default: return text ? { id, type: "paragraph", text } : null;
  }
}

export const SOP_ACTIONS: ActionDef[] = [
  act("sop.create", "Create a new SOP draft", "Start a draft in a department (optionally from a template, with function / process / category).", [f.str("title", "Title", true), f.ref("departmentId", "SOP department id (sop.department)", "sop.department", true), f.ref("templateId", "Template (sop.template id)", "sop.template"), f.ref("functionId", "Function (sop.function id)", "sop.function"), f.ref("processId", "Process (sop.process id)", "sop.process"), f.ref("categoryId", "Category (sop.category id)", "sop.category")], "CREATE", (v) => A.createSopAction({ title: String(v.title ?? ""), departmentId: String(v.departmentId ?? ""), templateId: str(v.templateId), functionId: str(v.functionId), processId: str(v.processId), categoryId: str(v.categoryId) }), "SOP draft created."),
  act("sop.write", "Write or edit an SOP draft", `Set the draft's title, description, purpose, scope and sections (this replaces the sections — read the current draft first and send all you want to keep). Optionally set priority, confidentiality, tags, mandatory, dates. ${BLOCK_HELP}`, [f.ref("sopId", "SOP id (sop.document)", "sop.document", true), f.str("title", "Title"), f.text("description", "Short description"), f.text("purpose", "Purpose"), f.text("scope", "Scope"), f.json("sections", "Sections: [{title, key?, blocks:[…]}]"), f.enum("priority", "Priority", PRIORITY), f.enum("confidentiality", "Confidentiality", CONF), f.bool("mandatory", "Mandatory reading"), f.bool("allowDownload", "Allow download"), f.list("tags", "Tags"), f.date("effectiveDate", "Effective date"), f.date("reviewDate", "Review date"), f.date("expiryDate", "Expiry date")], "EDIT", async (v) => {
    const viewer = await requireViewer();
    const found = await getReadableSop(viewer, String(v.sopId));
    if (!found) return { ok: false, error: "SOP not found." };
    const d = found.doc;
    const current = d.draft;
    const sections: SopSection[] = Array.isArray(v.sections)
      ? (v.sections as Json[]).map((s) => ({ id: randomUUID(), key: typeof s.key === "string" && s.key ? s.key : randomUUID(), title: String(s.title ?? "Section"), blocks: (Array.isArray(s.blocks) ? (s.blocks as Json[]) : []).map(toBlock).filter((b): b is SopBlock => !!b) }))
      : current.sections;
    const content = { ...current, title: str(v.title) ?? current.title, description: v.description !== undefined ? String(v.description) : current.description, purpose: v.purpose !== undefined ? String(v.purpose) : current.purpose, scope: v.scope !== undefined ? String(v.scope) : current.scope, sections };
    const meta: Json = {};
    for (const k of ["priority", "confidentiality", "mandatory", "allowDownload", "tags", "effectiveDate", "reviewDate", "expiryDate"]) if (v[k] !== undefined) meta[k] = v[k];
    return A.saveSopAction(d._id, { baseUpdatedAt: d.updatedAt.toISOString(), meta, content });
  }, "SOP draft saved."),
  act("sop.publish", "Publish an SOP", "Publish the draft as a new version (minor or major) with a change summary; optionally require everyone to re-acknowledge.", [f.ref("sopId", "SOP id", "sop.document", true), f.enum("changeType", "Change type", ["minor", "major"], true), f.text("changeSummary", "What changed", true), f.bool("requireReack", "Require re-acknowledgement"), f.date("reackDueDate", "Re-acknowledge by")], "PUBLISH", (v) => A.publishSopAction(String(v.sopId), { changeType: v.changeType === "major" ? "major" : "minor", changeSummary: String(v.changeSummary ?? ""), requireReack: v.requireReack === true, reackDueDate: str(v.reackDueDate) }), "SOP published.", true),
  act("sop.archive", "Archive or restore an SOP", "Archive a published SOP (or restore an archived one).", [f.ref("sopId", "SOP id", "sop.document", true), f.bool("archive", "Archive (false = restore)")], "ARCHIVE", (v) => (v.archive === false ? A.restoreSopAction(String(v.sopId)) : A.archiveSopAction(String(v.sopId))), "Done.", true),
  act("sop.delete_draft", "Delete a draft SOP", "Delete an SOP that has never been published.", [f.ref("sopId", "SOP id", "sop.document", true)], "EDIT", (v) => A.deleteDraftSopAction(String(v.sopId)), "Draft deleted.", true),
  act("sop.revert_to_version", "Revert the draft to an earlier version", "Load a published version back into the draft.", [f.ref("sopId", "SOP id", "sop.document", true), f.str("version", "Version, e.g. 1.2", true)], "EDIT", (v) => A.revertToVersionAction(String(v.sopId), String(v.version)), "Draft reverted."),
  act("sop.assign", "Assign an SOP to people", "Assign to users, teams, departments or roles (ids), with an optional due date; they are notified.", [f.ref("sopId", "SOP id", "sop.document", true), f.enum("type", "Assign to", ["user", "team", "department", "role"], true), f.list("ids", "Ids of those users/teams/departments/roles", ), f.date("dueDate", "Due date")], "ASSIGN", (v) => A.assignSopAction(String(v.sopId), { type: String(v.type), ids: (v.ids as string[]) ?? [], dueDate: str(v.dueDate) }), "SOP assigned."),
  act("sop.unassign", "Remove someone's assignment", "Take an SOP off a person.", [f.ref("sopId", "SOP id", "sop.document", true), f.str("userId", "User id", true)], "ASSIGN", (v) => A.unassignSopAction(String(v.sopId), String(v.userId)), "Unassigned."),
  act("sop.remind_pending", "Remind people who haven't acknowledged", "Send a reminder to everyone still pending on an SOP.", [f.ref("sopId", "SOP id", "sop.document", true)], "ASSIGN", (v) => A.remindPendingAction(String(v.sopId)), "Reminders sent."),
  act("sop.acknowledge", "Acknowledge an SOP (I have read and understood)", "Record your own acknowledgement of a published version.", [f.ref("sopId", "SOP id", "sop.document", true), f.str("version", "Version you read, e.g. 1.2", true)], "ACKNOWLEDGE", (v) => A.acknowledgeSopAction(String(v.sopId), String(v.version)), "Acknowledged."),
  act("sop.tick_checklist", "Tick or untick an SOP checklist item", "Mark a checklist item in an SOP as done.", [f.ref("sopId", "SOP id", "sop.document", true), f.str("itemKey", "Checklist item key", true), f.bool("done", "Done")], "VIEW", (v) => A.setChecklistItemAction(String(v.sopId), String(v.itemKey), v.done !== false), "Updated."),
  act("sop.submit_feedback", "Send feedback or a change request on an SOP", "Tell the owners something is wrong or unclear.", [f.ref("sopId", "SOP id", "sop.document", true), f.enum("kind", "Kind", ["feedback", "change_request"], true), f.text("message", "Message", true)], "VIEW", (v) => A.submitFeedbackAction(String(v.sopId), { kind: String(v.kind), message: String(v.message ?? "") }), "Feedback sent."),
  act("sop.resolve_feedback", "Resolve SOP feedback", "Close a feedback item with a note.", [f.ref("sopId", "SOP id", "sop.document", true), f.ref("feedbackId", "Feedback id (sop.feedback)", "sop.feedback", true), f.text("note", "Resolution note")], "EDIT", (v) => A.resolveFeedbackAction(String(v.sopId), String(v.feedbackId), String(v.note ?? "")), "Resolved."),
  act("sop.save_department", "Create or edit an SOP department", "Create (give name and code) or edit (give id) a department.", [f.str("id", "Department id to edit (leave out to create)"), f.str("name", "Name", true), f.str("code", "Short code (new only)"), f.text("description", "Description"), f.str("hrmsDepartmentId", "Linked HR department id"), f.bool("active", "Active")], "MANAGE_TEMPLATES", (v) => A.saveDepartmentAction({ id: str(v.id) ?? undefined, name: String(v.name ?? ""), code: str(v.code) ?? undefined, description: str(v.description) ?? undefined, hrmsDepartmentId: str(v.hrmsDepartmentId), active: v.active as boolean | undefined }), "Department saved."),
  act("sop.delete_department", "Delete an SOP department", "Delete a department that has no SOPs.", [f.ref("id", "Department id", "sop.department", true)], "MANAGE_TEMPLATES", (v) => A.deleteDepartmentAction(String(v.id)), "Department deleted.", true),
  act("sop.save_function", "Create or edit an SOP function", "A business function inside a department.", [f.str("id", "Function id to edit (leave out to create)"), f.ref("departmentId", "Department id", "sop.department", true), f.str("name", "Name", true), f.text("description", "Description"), f.bool("active", "Active")], "MANAGE_TEMPLATES", (v) => A.saveFunctionAction({ id: str(v.id) ?? undefined, departmentId: String(v.departmentId ?? ""), name: String(v.name ?? ""), description: str(v.description) ?? undefined, active: v.active as boolean | undefined }), "Function saved."),
  act("sop.delete_function", "Delete an SOP function", "Delete a function.", [f.ref("id", "Function id", "sop.function", true)], "MANAGE_TEMPLATES", (v) => A.deleteFunctionAction(String(v.id)), "Function deleted.", true),
  act("sop.save_process", "Create or edit an SOP process", "A process inside a function (give parentId for a sub-process).", [f.str("id", "Process id to edit (leave out to create)"), f.ref("functionId", "Function id", "sop.function", true), f.ref("parentId", "Parent process id (for a sub-process)", "sop.process"), f.str("name", "Name", true), f.text("description", "Description"), f.bool("active", "Active")], "MANAGE_TEMPLATES", (v) => A.saveProcessAction({ id: str(v.id) ?? undefined, functionId: String(v.functionId ?? ""), parentId: str(v.parentId), name: String(v.name ?? ""), description: str(v.description) ?? undefined, active: v.active as boolean | undefined }), "Process saved."),
  act("sop.delete_process", "Delete an SOP process", "Delete a process.", [f.ref("id", "Process id", "sop.process", true)], "MANAGE_TEMPLATES", (v) => A.deleteProcessAction(String(v.id)), "Process deleted.", true),
  act("sop.save_category", "Create or edit an SOP category", "A category with an optional colour.", [f.str("id", "Category id to edit (leave out to create)"), f.str("name", "Name", true), f.str("color", "Colour (hex)"), f.text("description", "Description"), f.bool("active", "Active")], "MANAGE_TEMPLATES", (v) => A.saveCategoryAction({ id: str(v.id) ?? undefined, name: String(v.name ?? ""), color: str(v.color) ?? undefined, description: str(v.description) ?? undefined, active: v.active as boolean | undefined }), "Category saved."),
  act("sop.delete_category", "Delete an SOP category", "Delete a category.", [f.ref("id", "Category id", "sop.category", true)], "MANAGE_TEMPLATES", (v) => A.deleteCategoryAction(String(v.id)), "Category deleted.", true),
  act("sop.duplicate_template", "Duplicate an SOP template", "Copy a template.", [f.ref("id", "Template id", "sop.template", true)], "MANAGE_TEMPLATES", (v) => A.duplicateTemplateAction(String(v.id)), "Template duplicated."),
  act("sop.delete_template", "Delete an SOP template", "Delete a template.", [f.ref("id", "Template id", "sop.template", true)], "MANAGE_TEMPLATES", (v) => A.deleteTemplateAction(String(v.id)), "Template deleted.", true),
  act("sop.update_settings", "Change SOP settings", "Expiring-soon days, default review months, default due days, re-acknowledge on new version, reminder repeat days, downloads.", [f.num("expiringSoonDays", "Expiring soon (days)", true), f.num("defaultReviewMonths", "Default review (months)", true), f.num("defaultDueDays", "Default due (days)", true), f.bool("reackOnNewVersion", "Re-acknowledge on new version"), f.num("reminderRepeatDays", "Reminder repeat (days)", true), f.bool("defaultAllowDownload", "Allow downloads by default")], "MANAGE_PERMISSIONS", (v) => A.updateSettingsAction({ expiringSoonDays: Number(v.expiringSoonDays), defaultReviewMonths: Number(v.defaultReviewMonths), defaultDueDays: Number(v.defaultDueDays), reackOnNewVersion: v.reackOnNewVersion === true, reminderRepeatDays: Number(v.reminderRepeatDays), defaultAllowDownload: v.defaultAllowDownload === true }), "Settings saved."),
  act("sop.save_template", "Create or edit an SOP template", "A reusable outline: name, description, the departments it suits, and sections [{title, hint}]. Leave id out to create.", [f.str("id", "Template id to edit (leave out to create)"), f.str("name", "Name", true), f.text("description", "Description"), f.list("departmentCodes", "Department codes"), f.json("sections", "Sections: [{title, hint}]", true), f.bool("active", "Active")], "MANAGE_TEMPLATES", (v) => A.saveTemplateAction({ id: str(v.id) ?? undefined, name: String(v.name ?? ""), description: str(v.description) ?? undefined, departmentCodes: (v.departmentCodes as string[]) ?? undefined, sections: v.sections, active: v.active as boolean | undefined }), "Template saved."),
];

function blockText(b: SopBlock): string {
  switch (b.type) {
    case "paragraph": case "note": case "warning": case "example": case "reference": return b.type === "paragraph" ? b.text : `${b.type.toUpperCase()}: ${b.text}`;
    case "heading": return `${b.level === 3 ? "###" : "##"} ${b.text}`;
    case "steps": return b.items.map((x, i) => `${i + 1}. ${x}`).join("\n");
    case "bullets": return b.items.map((x) => `- ${x}`).join("\n");
    case "table": return [b.header.join(" | "), ...b.rows.map((r) => r.join(" | "))].join("\n");
    case "checklist": return `${b.title}\n${b.items.map((x) => `[ ] ${x.text}`).join("\n")}`;
    case "link": return `${b.label}: ${b.url}`;
    default: return "";
  }
}

export const SOP_REPORTS: ReportDef[] = [
  {
    key: "sop.read", panel: "sop", label: "Read an SOP", description: "The full text of an SOP (published version, or the draft when asked) with its sections, steps and checklists.", level: "any", allow: can("VIEW"),
    params: [f.ref("sopId", "SOP id (sop.document)", "sop.document", true), f.bool("draft", "Read the draft instead of the published version")],
    run: async (v) => {
      const viewer = await requireViewer();
      const found = await getReadableSop(viewer, String(v.sopId));
      if (!found) return fail("SOP not found.");
      const d = found.doc;
      const c = v.draft === true ? d.draft : d.live ?? d.draft;
      const text = [`# ${c.title}`, c.description, `Purpose: ${c.purpose}`, `Scope: ${c.scope}`, ...c.sections.map((s) => `\n## ${s.title}\n${s.blocks.map(blockText).join("\n\n")}`)].filter(Boolean).join("\n");
      return { id: d._id, code: d.code, status: found.status, version: d.version, text: text.length > 14000 ? `${text.slice(0, 14000)}\n…` : text };
    },
  },
];
void STATUS;
