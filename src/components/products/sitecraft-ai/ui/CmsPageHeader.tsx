import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { BreadcrumbItemData } from "@/components/products/dealflow-ai/Breadcrumbs";

/**
 * The header every CMS screen opens with — the same page header as every other product: sub-page trail, title (with
 * optional status badges), one-line description and the screen's actions. `icon` and `className` are kept so existing
 * callers compile; the standard header does not draw them.
 */
export default function CmsPageHeader({
  breadcrumbs,
  title,
  description,
  badges,
  actions,
}: {
  breadcrumbs?: BreadcrumbItemData[];
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <PanelPageHeader
      breadcrumbs={[{ label: "CMS", href: "/sitecraft-ai" }, ...(breadcrumbs ?? [])]}
      title={badges ? <span className="inline-flex flex-wrap items-center gap-2">{title}{badges}</span> : title}
      description={description}
      actions={actions}
    />
  );
}
