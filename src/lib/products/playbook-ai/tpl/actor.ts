import "server-only";
import { requireViewer } from "@/lib/products/playbook-ai/viewer";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";

/** The signed-in person as the Playbook data layer wants them. Throws "Unauthorized" when signed out (server actions and pages only). */
export async function requireActor(): Promise<PbActor> {
  const v = await requireViewer();
  return { id: v.userId, email: v.email, name: v.name, roles: v.roles, permissionOverrides: v.overrides };
}
