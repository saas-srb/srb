"use server";

import { requireLms } from "@/lib/lms-auth";
import { getViewer } from "@/lib/products/agentos/viewer";
import { endCallAction } from "@/lib/products/agentos/calls/actions";
import type { ActionResult } from "@/lib/products/agentos/calls/action-run";
import {
  countActiveDealflowCalls, isVisibleDealflowCall, listActiveDealflowCalls, listCallPeople, listPersonCalls, loadCallPerson, loadPanelCallDetail, type PanelViewerCtx,
} from "@/lib/dealflow-ai/call-panel";
import { isPanelFilter, type PanelActiveCall, type PanelCallDetail, type PanelCallsPage, type PanelPeoplePage, type PanelPersonView } from "@/lib/dealflow-ai/call-panel-types";

/**
 * Server actions behind the AI Voice Calls page. The person is resolved here from the sessions (never from arguments): the CRM
 * session must hold VIEW_LEADS, and the AgentOS identity (if any) decides what of a call can be opened.
 */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

async function context(): Promise<PanelViewerCtx | null> {
  const lms = await requireLms("VIEW_LEADS");
  if (!lms) return null;
  return { lms, agentos: await getViewer().catch(() => null) };
}

export async function loadPeopleAction(input: { q?: string; filter?: string; page?: number }): Promise<PanelPeoplePage | null> {
  const ctx = await context();
  if (!ctx) return null;
  return listCallPeople(ctx, { q: str(input?.q, 80), filter: isPanelFilter(input?.filter) ? input.filter : "all", page: Number(input?.page) || 1 });
}

export async function loadPersonAction(entityType: string, entityId: string): Promise<{ person: PanelPersonView; calls: PanelCallsPage } | null> {
  const ctx = await context();
  if (!ctx) return null;
  const person = await loadCallPerson(ctx, str(entityType, 20), str(entityId, 80));
  if (!person) return null;
  return { person, calls: await listPersonCalls(ctx, person.entityType, person.entityId, 1) };
}

export async function loadCallsAction(entityType: string, entityId: string, page: number): Promise<PanelCallsPage | null> {
  const ctx = await context();
  if (!ctx) return null;
  return listPersonCalls(ctx, str(entityType, 20), str(entityId, 80), Number(page) || 1);
}

export async function loadCallDetailAction(callId: string): Promise<PanelCallDetail | null> {
  const ctx = await context();
  if (!ctx) return null;
  return loadPanelCallDetail(ctx, str(callId, 64));
}

export async function loadActiveCallsAction(): Promise<PanelActiveCall[] | null> {
  const ctx = await context();
  if (!ctx) return null;
  return listActiveDealflowCalls(ctx);
}

/** For the sidebar badge. 0 for anyone without VIEW_LEADS. */
export async function countActiveCallsAction(): Promise<number> {
  const ctx = await context();
  return ctx ? countActiveDealflowCalls(ctx) : 0;
}

/** Ends (or cancels) a DealFlow call. AgentOS decides who may: whoever placed it, or a person with take-over / manage rights. */
export async function endDealflowCallAction(callId: string): Promise<ActionResult<{ ended: true; via: string }>> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "You don't have access to AI calls." };
  const id = str(callId, 64);
  if (!(await isVisibleDealflowCall(ctx, id))) return { ok: false, error: "That call is no longer available." };
  if (!ctx.agentos) return { ok: false, error: "Ending a call needs an AgentOS account. Ask an admin to give you access to AgentOS." };
  return endCallAction(id);
}
