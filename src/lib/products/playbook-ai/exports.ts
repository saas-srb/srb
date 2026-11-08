import "server-only";
import { getAckDetail, getCompliance } from "@/lib/products/playbook-ai/analytics";
import { exportAudit } from "@/lib/products/playbook-ai/audit";
import { parseLibraryQuery, queryLibrary } from "@/lib/products/playbook-ai/library";
import { listVisibleSummaries } from "@/lib/products/playbook-ai/sops";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { userNames } from "@/lib/products/playbook-ai/people";
import { getConfidentialityMeta, getPriorityMeta, getSopStatusMeta } from "@/lib/products/playbook-ai/constants";
import { isReviewOverdue } from "@/lib/products/playbook-ai/lifecycle";
import { todayIso } from "@/lib/products/playbook-ai/db";
import type { SopViewer } from "@/lib/products/playbook-ai/types";

/** Tabular exports. Every dataset is built from the viewer's permission-filtered data, never a raw collection dump. */

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}
export interface ExportSet {
  title: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export const EXPORT_TYPES = ["library", "my", "acknowledgements", "compliance", "reviews", "audit"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export async function buildExport(v: SopViewer, type: ExportType, sp: Record<string, string | undefined>): Promise<ExportSet> {
  switch (type) {
    case "library":
    case "my": {
      const q = parseLibraryQuery(sp);
      const res = await queryLibrary(v, q, { all: true, scope: type === "my" ? "mine" : undefined });
      return {
        title: type === "my" ? "My SOPs" : "SOP Library",
        columns: [
          { header: "SOP ID", key: "code", width: 16 }, { header: "Title", key: "title", width: 42 }, { header: "Department", key: "department" },
          { header: "Function", key: "fn" }, { header: "Process", key: "process" }, { header: "Category", key: "category" }, { header: "Owner", key: "owner" },
          { header: "Author", key: "author" }, { header: "Version", key: "version", width: 10 }, { header: "Status", key: "status", width: 12 },
          { header: "Priority", key: "priority", width: 10 }, { header: "Confidentiality", key: "conf", width: 18 }, { header: "Mandatory", key: "mandatory", width: 11 },
          { header: "Effective", key: "effective", width: 12 }, { header: "Review", key: "review", width: 12 }, { header: "Expiry", key: "expiry", width: 12 },
          { header: "Tags", key: "tags" }, { header: "Assigned", key: "assigned", width: 10 }, { header: "Acknowledged", key: "acked", width: 13 },
          { header: "Updated", key: "updated", width: 12 },
        ],
        rows: res.items.map((s) => ({
          code: s.code, title: s.title, department: s.departmentName, fn: s.functionName, process: s.processName, category: s.categoryName,
          owner: s.ownerName, author: s.authorName, version: s.version ? `v${s.version}` : "", status: getSopStatusMeta(s.status).label,
          priority: getPriorityMeta(s.priority).label, conf: getConfidentialityMeta(s.confidentiality).label, mandatory: s.mandatory ? "Yes" : "No",
          effective: s.effectiveDate ?? "", review: s.reviewDate ?? "", expiry: s.expiryDate ?? "", tags: s.tags.join(", "),
          assigned: s.ack?.assigned ?? "", acked: s.ack?.acknowledged ?? "", updated: day(s.updatedAt),
        })),
      };
    }
    case "acknowledgements": {
      const rows = await getAckDetail(v);
      return {
        title: "Acknowledgements",
        columns: [
          { header: "SOP ID", key: "code", width: 16 }, { header: "SOP", key: "sop", width: 40 }, { header: "Current version", key: "version", width: 14 },
          { header: "SOP department", key: "dept" }, { header: "Person", key: "person" }, { header: "Person's department", key: "pdept" },
          { header: "Assigned by", key: "by" }, { header: "Assigned via", key: "via" }, { header: "Assigned on", key: "at", width: 12 },
          { header: "Due", key: "due", width: 12 }, { header: "Viewed", key: "viewed", width: 12 }, { header: "Acknowledged", key: "ackAt", width: 13 },
          { header: "Acknowledged version", key: "ackV", width: 18 }, { header: "Status", key: "state", width: 14 },
        ],
        rows: rows.map((r) => ({
          code: r.sopCode, sop: r.sopTitle, version: r.version ? `v${r.version}` : "", dept: r.department, person: r.person, pdept: r.personDepartment,
          by: r.assignedBy, via: r.assignedVia, at: day(r.assignedAt), due: r.dueDate ?? "", viewed: day(r.viewedAt), ackAt: day(r.acknowledgedAt),
          ackV: r.acknowledgedVersion ? `v${r.acknowledgedVersion}` : "", state: r.state,
        })),
      };
    }
    case "compliance": {
      const c = await getCompliance(v);
      return {
        title: "Department compliance",
        columns: [
          { header: "Department", key: "name", width: 26 }, { header: "SOPs in force", key: "live", width: 14 }, { header: "Assigned", key: "assigned", width: 10 },
          { header: "Acknowledged", key: "ack", width: 13 }, { header: "Pending", key: "pending", width: 10 }, { header: "Overdue", key: "overdue", width: 10 },
          { header: "Rate %", key: "rate", width: 8 },
        ],
        rows: c.byDepartment.map((d) => ({ name: d.name, live: d.liveSops, assigned: d.assigned, ack: d.acknowledged, pending: d.pending, overdue: d.overdue, rate: d.rate ?? "" })),
      };
    }
    case "reviews": {
      const [list, tax] = await Promise.all([listVisibleSummaries(v), getTaxonomy()]);
      const today = todayIso();
      const dept = new Map(tax.departments.map((d) => [d._id, d.name]));
      const names = await userNames(list.map((s) => s.ownerId));
      const rows = list
        .filter((s) => s.status !== "draft" && s.status !== "archived" && (s.reviewDate || s.expiryDate))
        .sort((a, b) => (a.reviewDate ?? a.expiryDate ?? "").localeCompare(b.reviewDate ?? b.expiryDate ?? ""));
      return {
        title: "Review & expiry schedule",
        columns: [
          { header: "SOP ID", key: "code", width: 16 }, { header: "Title", key: "title", width: 42 }, { header: "Department", key: "dept" }, { header: "Owner", key: "owner" },
          { header: "Version", key: "version", width: 10 }, { header: "Status", key: "status", width: 12 }, { header: "Review date", key: "review", width: 12 },
          { header: "Review overdue", key: "overdue", width: 14 }, { header: "Expiry date", key: "expiry", width: 12 },
        ],
        rows: rows.map((s) => ({
          code: s.code, title: s.title, dept: dept.get(s.departmentId) ?? "", owner: names.get(s.ownerId) ?? "", version: s.version ? `v${s.version}` : "",
          status: getSopStatusMeta(s.status).label, review: s.reviewDate ?? "", overdue: isReviewOverdue(s, today) ? "Yes" : "", expiry: s.expiryDate ?? "",
        })),
      };
    }
    case "audit": {
      const rows = await exportAudit({ sopId: sp.sop || undefined, action: sp.action || undefined, entity: sp.entity || undefined, from: sp.from || undefined, to: sp.to || undefined, q: sp.search || undefined });
      return {
        title: "SOP audit log",
        columns: [
          { header: "When", key: "when", width: 20 }, { header: "Actor", key: "actor", width: 28 }, { header: "Action", key: "action", width: 14 },
          { header: "Entity", key: "entity", width: 14 }, { header: "Subject", key: "label", width: 40 }, { header: "Details", key: "summary", width: 60 },
        ],
        rows: rows.map((r) => ({ when: r.createdAt.toISOString().replace("T", " ").slice(0, 19), actor: r.actorEmail ?? r.actorId, action: r.action, entity: r.entity, label: r.entityLabel ?? "", summary: r.summary ?? "" })),
      };
    }
  }
}
