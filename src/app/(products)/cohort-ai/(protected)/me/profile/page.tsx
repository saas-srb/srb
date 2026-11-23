import { redirect } from "next/navigation";

// The old My ... address now forwards to the normal page.
export default function OldProfileRedirect() {
  redirect("/cohort-ai/students");
}
