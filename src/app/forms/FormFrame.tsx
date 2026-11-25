import type { ReactNode } from "react";
import { getCompanyBrand } from "@/lib/platform/branding";

/** The plain page around a hosted form: the company's name and nothing of a website, so it also sits well inside a frame. */
export default async function FormFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const brand = await getCompanyBrand();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 px-4 py-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">{brand.name}</p>
        <h1 className="text-2xl font-black tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      {children}
    </main>
  );
}
