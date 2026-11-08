# Business continuity and disaster recovery

**Status: draft for adoption. Version 1.**

- **Targets (to confirm by the owner):** recovery time 8 hours, recovery point 24 hours.
- **Backups.** Database backups by the managed database provider with point-in-time recovery turned on; uploaded files in durable object storage. Backups are encrypted and access-controlled.
- **Application.** Rebuilt from git on the hosting provider; configuration kept in the provider's settings, with a sealed copy of required variable names (not values) in the repository docs.
- **Restore test.** At least twice a year restore the latest backup into a separate environment, check a sample of companies, and record time taken. A backup that has not been restored is not counted as a backup.
- **Failure scenarios.** Provider outage (wait / fail over per provider status), data corruption (point-in-time restore), compromised credentials (rotate, revoke sessions), loss of a key person (documentation in `docs/`).
- **Communication.** Status page and email to affected customers.
