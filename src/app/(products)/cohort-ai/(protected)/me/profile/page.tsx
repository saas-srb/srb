import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import MyProfileForm from "@/components/products/cohort-ai/MyProfileForm";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { getStudent, serializeStudent } from "@/lib/products/cohort-ai/students";

export default async function MyProfilePage() {
  const user = await getCurrentTmsUser();
  if (!user?.studentId) redirect("/cohort-ai");
  const student = await getStudent(user.studentId);
  if (!student) redirect("/cohort-ai");

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai/me" }, { label: "Profile" }]}
        title={<>My Profile</>}
        description={<>Keep your contact details and links up to date. <span className="font-mono">{student.studentCode}</span></>}
      />
      <MyProfileForm student={serializeStudent(student)} />
    </div>
  );
}
