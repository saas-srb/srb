"use client";

import { useRouter } from "next/navigation";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export default function ThemePreviewPageSelect({
  themeKey,
  pages,
  selectedId,
}: {
  themeKey: string;
  pages: { id: string; path: string; title: string }[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <Select value={selectedId} onValueChange={(v) => v && router.push(`/sitecraft-ai/theme/${themeKey}/preview?page=${v}`)}>
      <SelectTrigger className="w-64">
        <SelectValue placeholder="Choose a page">
          {(value: string) => pages.find((p) => p.id === value)?.title ?? "Choose a page"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {pages.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.title} ({p.path})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
