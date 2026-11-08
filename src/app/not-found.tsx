import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";
import ErrorScreen from "@/components/errors/ErrorScreen";
import { buttonVariants } from "@/components/ui/button";

/** Any address that doesn't match a page (and `notFound()` from a route that finds nothing). */
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      icon={<SearchX className="size-6" />}
      title="This page can’t be found"
      actions={
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Back to home <ArrowRight className="size-4" data-icon="inline-end" />
        </Link>
      }
      footer="If you followed a link here, it may have moved or been removed."
    >
      The address may be mistyped, or the page may have been moved or deleted.
    </ErrorScreen>
  );
}
