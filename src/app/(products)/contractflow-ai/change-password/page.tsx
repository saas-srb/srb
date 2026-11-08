import { redirect } from "next/navigation";
import { getCurrentLpmsUser } from "@/lib/lpms-auth";
import ChangePasswordForm from "@/components/products/playbook-ai/ChangePasswordForm";

export default async function LpmsChangePasswordPage() {
  const user = await getCurrentLpmsUser();
  if (!user) redirect("/contractflow-ai/login");
  if (!user.mustChangePassword) redirect("/contractflow-ai");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <ChangePasswordForm forced={true} />
    </main>
  );
}
