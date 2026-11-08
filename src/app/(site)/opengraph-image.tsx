import { homeOgImageMetadata, renderHomeOgImage } from "./home-og-image";

/** The site-wide share image — its text and alt come from CMS → Site Identity → Share image. */
export const generateImageMetadata = homeOgImageMetadata;

export default async function Image() {
  return renderHomeOgImage();
}
