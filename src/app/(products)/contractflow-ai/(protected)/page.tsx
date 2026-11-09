import { redirect } from "next/navigation";

/** The ContractFlow home is the Dashboard (its own page); the lists live under Documents, SOPs and KPIs. */
export default function ContractFlowHome() {
  redirect("/contractflow-ai/dashboard");
}
