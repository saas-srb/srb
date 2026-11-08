import { brandedMetadata } from "@/lib/platform/branding/metadata";

// The tab title carries the product's name from the Product Registry.
export const generateMetadata = () => brandedMetadata("{brand} {product:lms}", { robots: { index: false, follow: false, googleBot: { index: false, follow: false } } });

export default function LmsLayout({ children }: { children: React.ReactNode }) {
  return <div className="lms-shell min-h-screen bg-background text-foreground">{children}</div>;
}
