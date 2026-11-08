# Access control and password policy

**Status: draft for adoption. Version 1.**

- **Least privilege.** People get the role they need; Super Admin and console access are limited to named people and reviewed every quarter.
- **Passwords.** At least 10 characters, no common or repeated-character passwords, not containing the email name (enforced in `security/password.ts`). Stored with scrypt (N=2^15). Never shared, never sent in chat or email.
- **Multi-factor.** Mandatory for Super Admins and console users (authenticator app); recovery codes are stored hashed.
- **Lock-out and rate limits.** Repeated failures lock the account temporarily; sign-in and reset attempts are rate-limited per IP and per account.
- **Sessions.** Server-side, expiring, bound to the device; all other sessions end when a password changes or is reset.
- **Recovery.** Emailed, single-use link valid 30 minutes; a reset ends every session and is recorded in the sign-in events.
- **Joiners, movers, leavers.** Access is granted on the day of joining, changed when the role changes and removed on the last day; production credentials are rotated when a person with access leaves.
- **Secrets.** Only in the hosting provider's environment settings or `.env.local` (git-ignored); rotated when exposed. Secret scanning runs in CI.
