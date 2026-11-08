/**
 * Company setup (onboarding) and where it shows up. Pure (no server imports),
 * so every sign-in path and the tests use the same rules.
 *
 *  - LOGIN LANDING (`postLoginTarget`): when the company's owner (a Director of
 *    a customer company) signs in and setup is neither completed nor skipped, they
 *    land on `/commandos/onboarding` — unless a valid `next` was explicitly asked
 *    for (a deep link, a product's `/login?next=/talentos`), which always wins. Invited
 *    employees, other roles and the platform owner's company never land there.
 *  - There is NO redirect on any Workspace page: `/commandos` always shows the
 *    dashboard, and everything in the Workspace works with setup unfinished.
 *  - THE STRIP (`showSetupStrip`): while setup is not completed (skipped or not),
 *    the owner sees a "Complete setup" strip on every Workspace page except the
 *    wizard itself. "Skip for now" only stops the login landing.
 *  Loops are impossible: the only redirect happens once, at sign-in.
 */
export const ONBOARDING_PATH = "/commandos/onboarding";
/** The screen right after registration: the company's website and app addresses, with a button on to the wizard. */
export const WELCOME_PATH = "/commandos/welcome";
export const WORKSPACE_HOME = "/commandos";

export interface SetupFacts {
  /** `super_admin` of the company. */
  isOwner: boolean;
  isPlatformOwnerCompany: boolean;
  state: { completedAt: Date | null; dismissedAt: Date | null };
}

/** Who counts as the company's owner for setup purposes: a Director (invited teammates with other roles never do). */
export function isOnboardingOwner(roles: readonly string[]): boolean {
  return roles.includes("super_admin");
}

/** Setup is neither completed nor skipped: the owner is taken to the wizard at sign-in. */
export function setupIsOpen(f: SetupFacts): boolean {
  return f.isOwner && !f.isPlatformOwnerCompany && !f.state.completedAt && !f.state.dismissedAt;
}

/** Setup is not completed (skipped or not): the strip keeps showing. */
export function showSetupStrip(f: SetupFacts): boolean {
  return f.isOwner && !f.isPlatformOwnerCompany && !f.state.completedAt;
}

/**
 * Where a successful sign-in lands. `requestedNext` is the already-validated
 * same-origin path the person explicitly asked for (or null); it is honoured as is.
 */
export function postLoginTarget(f: SetupFacts & { requestedNext?: string | null }): string {
  if (f.requestedNext) return f.requestedNext;
  return setupIsOpen(f) ? ONBOARDING_PATH : WORKSPACE_HOME;
}
