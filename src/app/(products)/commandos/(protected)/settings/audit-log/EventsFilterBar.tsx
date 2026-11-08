"use client";

import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";

type Initial = { type: string; actor: string; from: string; to: string };

export default function EventsFilterBar({ types, actors }: { initial?: Initial; types: { value: string; label: string }[]; actors: { id: string; email: string }[] }) {
  return (
    <PanelFilterBar
      title="Search & Filters"
      description="Narrow the activity feed by what happened, who did it and when"
      fields={[
        { key: "type", label: "What happened", type: "select", options: types, allLabel: "Everything" },
        { key: "actor", label: "Who", type: "select", options: actors.map((a) => ({ value: a.id, label: a.email })), allLabel: "Anyone" },
        { key: "from", label: "From", type: "date" },
        { key: "to", label: "To", type: "date" },
      ]}
    />
  );
}
