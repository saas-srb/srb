import { redirect } from "next/navigation";

// The sign-in page now lives in the public site (same look as Sign up). Kept as a redirect so old links, bookmarks and internal redirects keep working.
export default function PortalLoginRedirect() {
  redirect("/login");
}
