import { permanentRedirect } from "next/navigation";

export default function FeaturesPageRedirect() {
  permanentRedirect("/products");
}
