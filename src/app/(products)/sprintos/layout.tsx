import { brandedMetadata } from "@/lib/platform/branding/metadata";

// The tab title carries the product's name from the Product Registry.
export const generateMetadata = () => brandedMetadata("{brand} {product:pms}", { robots: { index: false, follow: false, googleBot: { index: false, follow: false } } });

// `lms-shell` is the shared dashboard design-system class (palette tokens,
// card treatment, ambient background, control nudges) — reused verbatim so the
// PMS product is visually identical to the LMS and HRMS products.
export default function PmsLayout({ children }: { children: React.ReactNode }) {
  return <div className="lms-shell min-h-screen bg-background text-foreground">{children}</div>;
}
