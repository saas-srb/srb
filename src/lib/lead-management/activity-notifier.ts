import "server-only";
import { postLeadMessage } from "@/lib/lead-management/messages";
import { getLeadRecord } from "@/lib/lead-management/records";
import { stageMeta, LEAD_WORKFLOWS } from "@/lib/lead-management/workflows";

export interface ActivityChatPayload {
  leadId: string;
  activityType: "stage_change" | "document_update" | "interview_scheduled" | "meeting_scheduled" | "test_result" | "welcome";
  title: string;
  stageKey?: string;
  stepText?: string;
  progressPercent?: number;
  details?: string;
  actorStaffId?: string | null;
}

/**
 * Automatically formats and posts a structured Chat Message into the user's
 * Communication Center thread (/clientos/messages and LMS lead chat) whenever
 * there is any activity, status change, or progress update in the portal.
 */
export async function sendActivityChatMessage(payload: ActivityChatPayload): Promise<void> {
  const lead = await getLeadRecord(payload.leadId);
  if (!lead) return;

  const type = lead.type;
  const currentStageKey = payload.stageKey ?? lead.stage;
  const happyPath = (LEAD_WORKFLOWS[type] ?? []).filter((s) => !s.terminal);
  const curMeta = stageMeta(type, currentStageKey);
  const curIdx = happyPath.findIndex((s) => s.key === currentStageKey);

  const stepNumber = curIdx >= 0 ? curIdx + 1 : happyPath.length;
  const totalSteps = happyPath.length;
  const percent = payload.progressPercent ?? Math.min(100, Math.round((stepNumber / totalSteps) * 100));
  const stepText = payload.stepText ?? `Step ${stepNumber} of ${totalSteps} — ${curMeta?.portalLabel ?? currentStageKey}`;

  const messageLines: string[] = [
    `📌 Status & Progress Update: ${payload.title}`,
    `----------------------------------------`,
    `• Current Stage: ${curMeta?.portalLabel ?? currentStageKey}`,
    `• Progress: ${stepText} (${percent}% complete)`,
  ];

  if (payload.details) {
    messageLines.push(``, `Details: ${payload.details}`);
  }

  const body = messageLines.join("\n");

  try {
    await postLeadMessage({
      leadId: payload.leadId,
      body,
      visibility: "portal",
      channel: "message",
      authorType: "staff",
      authorStaffId: payload.actorStaffId ?? null,
    });
  } catch (err) {
    console.error("Failed to post activity chat message:", err);
  }
}
