"use server";

import { redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { addCustomDomain, removeCustomDomain, setPrimaryDomain, verifyCustomDomain } from "@/lib/platform/domains/custom";
import type { DomainActionResult } from "@/lib/platform/domains/types";

async function requireOwner() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  return user;
}

export async function addDomainAction(host: string): Promise<DomainActionResult> {
  await requireOwner();
  return addCustomDomain(String(host ?? ""));
}

export async function verifyDomainAction(host: string): Promise<DomainActionResult> {
  await requireOwner();
  return verifyCustomDomain(String(host ?? ""));
}

export async function setPrimaryDomainAction(host: string): Promise<DomainActionResult> {
  await requireOwner();
  return setPrimaryDomain(String(host ?? ""));
}

export async function removeDomainAction(host: string): Promise<DomainActionResult> {
  await requireOwner();
  return removeCustomDomain(String(host ?? ""));
}
