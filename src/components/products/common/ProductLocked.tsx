import LockedPage from "@/components/products/commandos/LockedPage";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { listDirectors, openRequestFor } from "@/lib/products/commandos/access-requests";
import { productName } from "@/lib/access/catalogue";
import { requestAccessAction } from "@/app/(products)/commandos/(protected)/locked/actions";

/**
 * The locked page for a part of a product, rendered inside the product's own shell when someone opens an address they have no access to
 * (instead of bouncing them to another page or to sign-in). Server side: it lists the company's Directors and records the request.
 */
export default async function ProductLocked({ product, feature }: { product: string; feature: string }) {
  const user = await getCurrentHubUser().catch(() => null);
  const [directors, asked] = await Promise.all([listDirectors(), user ? openRequestFor(user.id, "", feature) : Promise.resolve(null)]);
  async function request(input: { message: string }) {
    "use server";
    return requestAccessAction({ product, label: feature, message: input.message });
  }
  return <LockedPage title={feature} area={productName(product)} description={null} directors={directors.map(({ name, email }) => ({ name, email }))} alreadyAsked={Boolean(asked)} request={request} />;
}
