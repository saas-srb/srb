import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";

/** Title + description (+ trail on deeper pages): the same page header every product uses. */
export default function PlatformPageHeader({ title, description, crumbs = [], actions }: { title: string; description?: string; crumbs?: { label: string; href?: string }[]; actions?: React.ReactNode }) {
  return <PanelPageHeader breadcrumbs={[{ label: "Platform", href: "/console" }, ...crumbs, { label: title }]} title={title} description={description} actions={actions} />;
}
