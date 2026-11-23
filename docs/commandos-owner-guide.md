# CommandOS owner guide

For the person who owns a company's workspace (the Director). Plain steps, no developer words.

## Add a person
1. People & access, then Add person. Three steps: details (name, email, department, team, designation), access, review.
2. Step 2 shows every product and every feature with three choices: No access, Read only, Read & Write. Use the search box, "Show only granted", and the quick buttons per product or per area. Read only lets a person open and view; Read & Write also lets them change, create, approve or send. Some features say "Everyone's, not only own": without them a person sees only their own records.
3. Step 3 previews in plain words what the person can do, can only view, and cannot do. Then either set a temporary password or send an email invitation (the access is applied when they accept).
A person's title on every screen is their designation (for example "Senior Developer"), never a product role. Nobody can change their own access; a delegated manager cannot hand out individual features.

## Give or change access
Open the person, Edit, step 2. Save writes an audit event. People who only had the older roles open prefilled from them, and saving unchanged changes nothing. The Director's access cannot be changed. Use Bulk access to give the same access to many people, and copy access from one person to another.

## Access templates
Save a set of choices as a template and apply it when adding people or in bulk.

## Request-access flow
A person who opens something they do not have sees a polite "no access" page inside the normal layout, with a request button. Requests appear in the access requests panel for the Director (or a delegated manager) to approve or decline; approving applies the feature.

## Status changes
Active, on leave, suspended, left. A suspended or left person is signed out everywhere at once and cannot sign in. On leave can still sign in. Seats: only people who can sign in use a seat; the screen warns before the limit.

## Where each setting lives
Company setup (identity, departments, invitations, products), Integrations (email, payment, AI and other services), Product settings (one card per product), Domains, Plan & billing, Notification center, AI prompts, Scheduled jobs, Documents & PDFs, Backups, Import, Audit log, Security.

## Included default or your own
Every shared service starts as "Included default": nothing to set up and nothing to pay separately where your plan includes it. If you add your own account for a service ("Using your own account"), your keys are used; switching back keeps them. Each card has a Test button.

## Your own domain
Your default addresses end in the hosting service's name. Settings, Domains: add your own domain (website, and `app.` for the workspace) and your emails can go out from your own address too (Sender email). The Setup progress step "Use your own web address" tracks it.

## Setup progress
A checklist of what is left, the next best step, and why each matters. A step is done when it really is (it checks your settings, not a tick box).

## Migrations and rollback (for the platform operator)
Data migrations run first as a dry run that only reports; apply them once on a throwaway copy of the database that the owner supplies, then on the real one. Each migration records what it wrote so it can be reverted (`test:access`: "revert removes only what that migration wrote"). Take a backup first (Backups & data).

## Not verified
These screens were checked by automated tests and dev-harness screenshots, not clicked through by a person in a real browser.
