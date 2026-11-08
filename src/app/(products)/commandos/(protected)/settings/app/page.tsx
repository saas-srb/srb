import { redirect } from "next/navigation";

/** The Mobile app settings moved into Apps (settings, downloads and desktop builds in one place). */
export default function MobileAppSettingsRedirect() {
  redirect("/commandos/settings/apps");
}
