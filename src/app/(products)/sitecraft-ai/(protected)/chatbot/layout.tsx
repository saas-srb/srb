import { requireLmsOrCmsPage } from "@/lib/lms-auth";

// Every page in this section is for people who hold the capability (or CMS administrators) — a CMS editor or viewer is sent back to the CMS home.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireLmsOrCmsPage("VIEW_CHATBOT");
  return children;
}
