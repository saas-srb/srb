import { redirect } from "next/navigation";

// The old My tasks address now forwards to the normal page.
export default function OldTasksRedirect() {
  redirect("/sprintos/tasks");
}
