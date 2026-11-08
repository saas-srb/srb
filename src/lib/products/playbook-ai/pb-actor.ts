import "server-only";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";

/** The signed-in person as the document data layer needs them, or null when signed out. Use in server actions, pages and route handlers. */
export async function getPbActor(): Promise<PbActor | null> {
  const v = await getViewer();
  return v ? { id: v.userId, email: v.email, name: v.name, roles: v.roles, permissionOverrides: v.overrides } : null;
}
