"use client";

import SecondStepScreen, { type ScreenRow, type SecondStepView } from "@/components/security/SecondStepScreen";

const row = (id: ScreenRow["id"], status: ScreenRow["status"], description?: string): ScreenRow => {
  const base = {
    app: { title: "Authenticator app", description: "Use the code from your authenticator app" },
    email: { title: "Email code", description: "We'll email a code to i*****@gmail.com" },
    sms: { title: "SMS code", description: "We'll text a code to +91 ******1234" },
    recovery: { title: "Recovery code", description: "Use one of your saved recovery codes" },
  }[id];
  return { id, status, title: base.title, description: description ?? base.description };
};

const FIXTURES: { name: string; view: SecondStepView }[] = [
  { name: "All methods available (authenticator first)", view: { method: "app", info: "Enter the 6-digit code from your authenticator app.", methods: [row("app", "available"), row("email", "available"), row("sms", "available"), row("recovery", "available")], trustAllowed: true } },
  { name: "Email code sent (resend countdown, wrong code)", view: { method: "email", hint: "i*****@gmail.com", info: "We sent a 6-digit code to i*****@gmail.com. It works for 10 minutes.", error: "That code isn't right or has expired.", resendIn: 38, methods: [row("app", "available"), row("email", "available"), row("sms", "not_set_up", "Not set up for this account"), row("recovery", "available")] } },
  { name: "Authenticator unreadable + email available (email opened automatically)", view: { method: "email", hint: "i*****@gmail.com", info: "We sent a 6-digit code to i*****@gmail.com. It works for 10 minutes.", resendIn: 45, methods: [row("app", "unavailable", "Not available right now"), row("email", "available"), row("sms", "not_set_up", "Not set up for this account"), row("recovery", "available")] } },
  { name: "Only recovery codes", view: { method: "recovery", info: "Enter one of your saved recovery codes.", methods: [row("app", "not_set_up", "Not set up for this account"), row("email", "not_set_up", "Not set up for this account"), row("recovery", "available")] } },
  { name: "Nothing usable", view: { method: "recovery", nothingUsable: true, supportEmail: "support@example.com", info: "We can't verify you with the methods available on this account right now. Try again in a few minutes.", methods: [row("app", "unavailable", "Not available right now"), row("email", "not_set_up", "Not set up for this account"), row("recovery", "not_set_up", "Not set up for this account")] } },
];

export default function SecondStepHarness() {
  return (
    <div className="min-h-screen bg-muted/40 p-6">
      <h1 className="mb-4 text-lg font-bold">Second-step sign-in: fixtures</h1>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {FIXTURES.map((f, i) => (
          <section key={f.name} data-fixture={i} className="mx-auto w-full max-w-sm rounded-2xl border bg-background p-5 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.name}</h2>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              <SecondStepScreen inputId={`code-${i}`} view={f.view} />
              <button type="submit" className="h-9 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground">Sign in</button>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
