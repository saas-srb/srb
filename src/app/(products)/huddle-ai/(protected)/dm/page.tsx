import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";

export default function Page() {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <PanelPageHeader title={<>Direct messages</>} description={<>Select a conversation on the left, or start a new one with the compose button.</>} />
    </div>
  );
}
