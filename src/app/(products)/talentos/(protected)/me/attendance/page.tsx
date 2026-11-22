import { redirect } from "next/navigation";

// "My Attendance" is now the normal Attendance page (it shows the person's own attendance first). The old address still works.
export default function MyAttendanceRedirect() {
  redirect("/talentos/attendance");
}
