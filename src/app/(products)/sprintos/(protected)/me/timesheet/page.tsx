import { redirect } from "next/navigation";

// The old My timesheet address now forwards to the normal page.
export default function OldTimesheetRedirect() {
  redirect("/sprintos/timesheets");
}
