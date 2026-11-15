// The organization master data lives in ONE service: `@/lib/platform/organization`. This re-export keeps
// existing TalentOS imports working; new code imports the service directly.
export * from "@/lib/platform/organization";
