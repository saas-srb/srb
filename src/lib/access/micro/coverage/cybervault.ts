import type { Guard } from "../types";

/**
 * CyberVault coverage: every page, route handler and server action of the product maps to the micro feature(s) that guard it (short keys, without the
 * `cybervault.` prefix), or says why it needs none. `scripts/test-micro-coverage.ts` enumerates the files and fails when anything is unmapped, when a
 * mapped item does not exist any more, when the code does not mention its key, and when a micro feature guards nothing.
 * Keys: `<path under src/app>` for pages and route handlers, `<path>#<function>` for server actions.
 */
const A = "cybervault/(protected)/actions.ts";
const open = (open: "self-service" | "session" | "public" | "redirect", reason: string): Guard => ({ open, reason });

export const CYBERVAULT_ROOTS = ["src/app/(products)/cybervault", "src/app/(products)/api/cybervault"];

export const CYBERVAULT_COVERAGE: Record<string, Guard> = {
  "cybervault/login/page.tsx": open("public", "The sign-in page."),
  "cybervault/change-password/page.tsx": open("session", "Changing one's own password."),
  "cybervault/change-password/actions.ts#changeDlmsPasswordAction": open("self-service", "Changes the signed-in person's own password."),
  "cybervault/(protected)/[...notFound]/page.tsx": open("public", "The not-found page inside the product."),
  "cybervault/(protected)/notifications/page.tsx": open("self-service", "A person's own notifications."),
  "cybervault/(protected)/settings/page.tsx": open("redirect", "Sends to the Workspace product settings, which the Workspace guards."),
  "cybervault/(protected)/page.tsx": { any: ["dashboard.view"] },
  "cybervault/(protected)/company/page.tsx": { any: ["company.view"] },
  "cybervault/(protected)/clients/page.tsx": { any: ["clients.view"] },
  "cybervault/(protected)/clients/[id]/page.tsx": { any: ["clients.view"] },
  "cybervault/(protected)/credentials/page.tsx": { any: ["credentials.view"] },
  "cybervault/(protected)/documents/page.tsx": { any: ["documents.view"] },
  "cybervault/(protected)/urls/page.tsx": { any: ["urls.view"] },
  "cybervault/(protected)/notes/page.tsx": { any: ["notes.view"] },
  "cybervault/(protected)/expiry/page.tsx": { any: ["expiry.view"] },
  [`${A}#dlmsLogoutAction`]: open("self-service", "Signs the person out."),
  [`${A}#markNotificationsReadAction`]: open("self-service", "Marks the person's own notifications read."),
  [`${A}#saveCredentialAction`]: { any: ["credentials.create", "credentials.edit"] },
  [`${A}#revealCredentialAction`]: { any: ["credentials.reveal"] },
  [`${A}#saveDocumentAction`]: { any: ["documents.upload"] },
  [`${A}#saveLinkAction`]: { any: ["urls.create", "urls.edit"] },
  [`${A}#saveNoteAction`]: { any: ["notes.create", "notes.edit"] },
  [`${A}#setStatusAction`]: { any: ["credentials.edit", "documents.upload", "urls.edit", "notes.edit"], via: "typeKey(" },
  [`${A}#deleteRecordAction`]: { any: ["credentials.delete", "documents.delete", "urls.delete", "notes.delete"], via: "typeKey(" },
  [`${A}#saveAccessAction`]: { any: ["settings.assign"] },
  [`${A}#saveSettingsAction`]: { any: ["settings.alerts"] },
  "api/cybervault/documents/route.ts": { any: ["documents.upload"] },
  "api/cybervault/files/[id]/route.ts": { any: ["documents.download"] },
  "api/cybervault/cron/route.ts": open("public", "Scheduled job; refuses to run without the cron secret."),
};

/** Micro features guarded by something other than a page, route or action (a button or section inside a page, the Workspace screen, the AI tools): where each is enforced. */
export const CYBERVAULT_EXTRA: Record<string, string> = {
  "scope.all": "viewer.ts (seesAll) and scopeFilter",
  "dashboard.activity": "overview.ts (activity feed) and OwnerVault overview",
  "activity.view": "dashboard link and the AI audit-log entity",
  "company.manage": "viewer.ts canWriteScope",
  "clients.manage": "viewer.ts canWriteScope",
  "credentials.view": "records.ts scopeFilter and loadScoped",
  "documents.view": "records.ts scopeFilter and loadScoped",
  "urls.view": "records.ts scopeFilter and loadScoped",
  "notes.view": "records.ts scopeFilter and loadScoped",
  "credentials.delete": "records.ts needType (deleteRecord)",
  "documents.delete": "records.ts needType (deleteRecord)",
  "urls.delete": "records.ts needType (deleteRecord)",
  "notes.delete": "records.ts needType (deleteRecord)",
  "documents.download": "RecordTables preview and download buttons",
  "credentials.reveal": "RecordTables reveal and copy buttons",
};
