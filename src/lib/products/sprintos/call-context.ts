import { pickContext } from "@/lib/products/call-writeback";

/**
 * The only project details SprintOS tells the calling agent about by default: who the contact is and what the project is called.
 * Budget, costs, hours and dates are never passed; the person adds anything else in the call dialog's notes.
 */
export const PROJECT_CLOSE_CONTEXT = ["contact_name", "project_name"] as const;

export function projectCloseContext(project: { name?: unknown }, contact: { name?: unknown } | null): Record<string, string> {
  return pickContext({ contact_name: contact?.name, project_name: project.name }, PROJECT_CLOSE_CONTEXT);
}
