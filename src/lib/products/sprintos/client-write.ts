import "server-only";
import { createClient, updateClient, getClient } from "@/lib/products/sprintos/clients";
import { validateClient } from "@/lib/products/sprintos/validation";
import { recordActivity, diffSummary } from "@/lib/products/sprintos/activity";
import type { RecordActor, RecordWriteResult } from "@/lib/products/shared/record-write";

/** Adds or changes a client (validation and activity record). The caller has already checked that `actor` may. */
export async function saveClientRecord(user: RecordActor, input: Record<string, unknown>, id?: string): Promise<RecordWriteResult> {
  const v = validateClient(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (id) {
    const before = await getClient(id);
    if (!before) return { ok: false, error: "Client not found." };
    const updated = await updateClient(id, v.data, user.id);
    await recordActivity({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "client",
      entityId: id,
      entityLabel: v.data.companyName,
      summary: diffSummary(
        { name: before.companyName, status: before.status, industry: before.industry },
        { name: v.data.companyName, status: v.data.status, industry: v.data.industry },
        ["name", "status", "industry"]
      ),
    });
    return { ok: true, id: updated?._id };
  }

  const created = await createClient(v.data, user.id);
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "client",
    entityId: created._id,
    entityLabel: v.data.companyName,
  });
  return { ok: true, id: created._id };
}
