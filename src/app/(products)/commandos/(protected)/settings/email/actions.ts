"use server";

import { redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { checkCompanySender, removeCompanySender, saveCompanySender, type SenderResult, type SenderView } from "@/lib/platform/email/sender";

async function requireOwner() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
}

export async function saveSenderAction(input: { domain: string; localPart: string; fromName: string; replyTo: string }): Promise<SenderResult<SenderView>> {
  await requireOwner();
  return saveCompanySender({ domain: String(input?.domain ?? ""), localPart: String(input?.localPart ?? ""), fromName: String(input?.fromName ?? ""), replyTo: String(input?.replyTo ?? "") });
}

export async function checkSenderAction(): Promise<SenderResult<SenderView>> {
  await requireOwner();
  return checkCompanySender();
}

export async function removeSenderAction(): Promise<SenderResult> {
  await requireOwner();
  return removeCompanySender();
}
