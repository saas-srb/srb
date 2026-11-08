import { redirect } from "next/navigation";

/** Registration is the one sign-up flow every customer uses. */
export default function RegisterPage() {
  redirect("/signup");
}
