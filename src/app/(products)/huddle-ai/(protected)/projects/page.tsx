import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";

export default function Page() {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <PanelPageHeader title={<>Project channels</>} description={<>One private channel per project. Membership tracks the project team automatically — pick a channel on the left.</>} />
    </div>
  );
}
