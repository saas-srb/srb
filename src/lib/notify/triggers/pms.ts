import "server-only";
import { notifyEmployees } from "@/lib/products/sprintos/notifications";

/** Projects: the person who is added to a project is told, with their role. */
export const pmsEvents = {
  addedToProject: async (employeeId: string, project: { id: string; name: string }, role: string) =>
    notifyEmployees([employeeId], (uid) => ({ recipientUserId: uid, type: "added_to_project", title: `You were added to ${project.name}`, body: `Your role: ${role.replace(/_/g, " ")}.`, link: `/sprintos/projects/${project.id}`, projectId: project.id, dedupeKey: `pms-member:${project.id}:${employeeId}` })),
};
