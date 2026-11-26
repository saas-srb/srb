import AddressCard from "@/components/hub/AddressCard";
import { companySiteUrl, appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { isSingleHost } from "@/lib/platform/domains/custom";
import { currentCompanyId } from "@/lib/platform/tenancy/context";

/** Whether this company has one address for everything (no website with us). */
export async function hasOneAddress(): Promise<boolean> {
  return isSingleHost(await currentCompanyId());
}

/** The company's website address and app address side by side, or its one address (server component: reads the live domain settings). */
export default async function CompanyAddresses({ focus }: { focus?: "website" | "app" }) {
  const [site, app] = await Promise.all([companySiteUrl(), currentCompanyId().then((id) => appUrlForCompany(id))]);
  if (await hasOneAddress()) {
    return (
      <AddressCard
        kind="app"
        caption="Your workspace"
        title="Your address"
        url={app}
        hint="You and your team sign in here to the Workspace and your products. Your public forms and payment links use this address too."
      />
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AddressCard
        kind="website"
        caption="Public website"
        title="Website domain"
        url={site}
        hint="This is your public website. Share it with customers, put it on your cards and social profiles. Anyone can open it, no sign-in needed."
        highlighted={focus === "website"}
      />
      <AddressCard
        kind="app"
        caption="Team app"
        title="App domain"
        url={app}
        hint="This is where you and your team sign in to the Workspace and every product (HR, CRM, Finance and more). Bookmark it and share it with your team."
        highlighted={focus === "app"}
      />
    </div>
  );
}
