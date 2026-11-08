import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";

export default function Page() {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <PanelPageHeader title={<>Group chats</>} description={<>Private conversations with a fixed set of people — a squad, a team, a project stand-up. Pick one on the left or create a new group.</>} />
    </div>
  );
}
