import { redirect } from "next/navigation";

// The "Me" home is now the normal Dashboard ("My requests" tab). The old address still works.
export default function MeHomeRedirect() {
  redirect("/spendiq");
}
