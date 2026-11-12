import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { completeFirstRunSetup, firstRunOpen } from "@/lib/platform/saas/first-run";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "First-run setup", robots: { index: false, follow: false } };

async function setup(formData: FormData) {
  "use server";
  const res = await completeFirstRunSetup({ code: String(formData.get("code") ?? ""), email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? "") });
  redirect(res.ok ? "/commandos/login" : `/setup?error=${encodeURIComponent(res.ok ? "" : res.error)}`);
}

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await firstRunOpen())) notFound();
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-16">
      <h1 className="text-2xl font-bold">Create the platform admin</h1>
      <p className="text-sm text-muted-foreground">This database has no platform admin yet. Enter the one-time setup code you were given, then choose the admin&apos;s email and password.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <form action={setup} className="space-y-3">
        <input name="code" required placeholder="Setup code" autoComplete="off" className="w-full rounded-md border bg-background px-3 py-2" />
        <input name="email" type="email" required placeholder="Admin email" autoComplete="email" className="w-full rounded-md border bg-background px-3 py-2" />
        <input name="password" type="password" required minLength={10} placeholder="Password (10+ characters)" autoComplete="new-password" className="w-full rounded-md border bg-background px-3 py-2" />
        <button type="submit" className="w-full rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground">Create admin</button>
      </form>
    </main>
  );
}
