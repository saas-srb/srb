# Incident response procedure

**Status: draft for adoption. Version 1.**

1. **Detect and report.** Anyone who suspects an incident tells the security owner immediately. Sources: audit log alerts, customer reports, researchers, provider notices.
2. **Triage (within 1 hour).** Open a record with time, systems, data and what is known. Classify: confirmed personal-data breach, security incident, or event only. Appoint an incident lead.
3. **Contain.** Revoke sessions (`destroySessionsEverywhere`), rotate exposed secrets, disable the affected feature, preserve logs and evidence.
4. **Report.**
   - **CERT-In** within **6 hours** of noticing a reportable cyber incident (the Directions of 28 April 2022; incident@cert-in.org.in).
   - **Data Protection Board of India** and each affected person for a personal-data breach, without delay, with the detailed report in the time the DPDP Rules set.
   - **Customers (as processor):** without undue delay, and within the time the DPA states.
5. **Eradicate and recover.** Fix the cause, restore from clean backups if needed, verify, and watch for repeat activity.
6. **Review (within 10 working days).** Write what happened, the root cause and the actions with owners; update controls and this procedure.

Keep the record for at least 3 years. Contact details (security owner, counsel, CERT-In point of contact) are an **owner** entry.
