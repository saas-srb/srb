import MyItemsPage from "@/components/products/playbook-ai/items/MyItemsPage";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <MyItemsPage kind="document" searchParams={searchParams} />;
}
