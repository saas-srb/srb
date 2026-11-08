import "server-only";
import { listDlmsManagerIds } from "@/lib/products/cybervault/access";
import { notifyDlmsUsers } from "@/lib/products/cybervault/notifications";
import { short } from "@/lib/notify/triggers/format";

/**
 * Vault (DLMS) notifications go to the vault's managers and admins only (never the content of a secret — names only), and never to the
 * person who did it. Revealing / copying a stored password is a security event, so managers hear about it (once per person per credential
 * per hour).
 */
const PATH: Record<string, string> = { credential: "credentials", document: "documents", link: "urls", note: "notes" };
const hourKey = () => new Date().toISOString().slice(0, 13);
async function managers(actor: string) {
  return (await listDlmsManagerIds()).filter((i) => i !== actor);
}

export const dlmsEvents = {
  added: async (type: string, id: string, name: string, actor: string) =>
    notifyDlmsUsers(await managers(actor), { type: "dlms_record_added", title: `New ${type} added: ${short(name, 60)}`, body: "Stored in the vault.", link: `/cybervault/${PATH[type] ?? "credentials"}`, dedupeKey: `dlms-add:${id}` }),
  revealed: async (id: string, name: string, how: "reveal" | "copy", actor: string, actorEmail: string) =>
    notifyDlmsUsers(await managers(actor), { type: "dlms_reveal", title: `Password ${how === "copy" ? "copied" : "revealed"}: ${short(name, 60)}`, body: `By ${actorEmail}.`, link: "/cybervault/credentials", dedupeKey: `dlms-reveal:${id}:${actor}:${hourKey()}` }),
  deleted: async (type: string, id: string, name: string, actor: string, actorEmail: string) =>
    notifyDlmsUsers(await managers(actor), { type: "dlms_record_deleted", title: `${type[0].toUpperCase()}${type.slice(1)} deleted: ${short(name, 60)}`, body: `By ${actorEmail}.`, link: `/cybervault/${PATH[type] ?? "credentials"}`, dedupeKey: `dlms-del:${id}` }),
  archived: async (type: string, id: string, name: string, archived: boolean, actor: string) =>
    notifyDlmsUsers(await managers(actor), { type: "dlms_record_archived", title: `${type[0].toUpperCase()}${type.slice(1)} ${archived ? "archived" : "restored"}: ${short(name, 60)}`, body: "", link: `/cybervault/${PATH[type] ?? "credentials"}`, dedupeKey: `dlms-arc:${id}:${archived ? 1 : 0}:${hourKey()}` }),
};
