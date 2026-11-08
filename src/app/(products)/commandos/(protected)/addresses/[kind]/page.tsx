import { redirect } from "next/navigation";

/** The old separate Website domain / App domain links (bookmarks, old emails) land on the one combined screen. */
export default function AddressesKindRedirect(): never {
  redirect("/commandos/addresses");
}
