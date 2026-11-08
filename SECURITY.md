# Security policy

## Reporting a vulnerability

Please report a suspected vulnerability privately, not in a public issue.

- Email the security address published at `/.well-known/security.txt` on the product's website (for example `security@<your domain>`), or use
  GitHub's **Report a vulnerability** (Security tab of this repository).
- Include what you found, where, the steps to reproduce it and the impact you expect. Do not include other people's data.
- Please give us reasonable time to fix it before you share details, and do not access, change or delete data that is not yours.

We acknowledge a report within three business days, tell you what we found, and keep you informed until it is fixed. The full policy,
including what is in scope and how we treat good-faith research, is on the website at `/vulnerability-disclosure`.

## Supported versions

Only the version running in production is supported. Fixes are released to it directly.

## What this repository does to stay secure

See `docs/compliance/` for the control register, the gap assessment and the release acceptance criteria. In short: dependencies are audited
on every change and weekly, the code is scanned with CodeQL, the repository is scanned for committed secrets, and a release is blocked by a
critical or high finding until it is fixed and re-tested.
