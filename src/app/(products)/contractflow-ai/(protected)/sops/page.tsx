import CloneListPage from "@/components/products/contractflow-ai/CloneListPage";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <CloneListPage kind="sop" searchParams={searchParams} />;
}
