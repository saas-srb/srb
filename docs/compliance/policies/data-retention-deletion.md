# Data retention and deletion policy

**Status: draft for adoption. Version 1.**

| Data | Kept for | How it ends |
| --- | --- | --- |
| Sign-in events and security logs | 180 days | Automatic expiry (TTL index) |
| Website consent records | 3 years | Automatic expiry |
| Password reset tokens | 30 minutes (records tidied by TTL) | Used or expired |
| Sessions | Until they expire or are revoked | Automatic |
| Company business data | While the contract lasts | Export on request, then deleted within 30 days of contract end; backups roll off within the backup window |
| Account data | While the account exists | Deleted on request after checking legal holds |
| Invoices and tax records | The statutory period (India: 8 years for GST records unless the law says otherwise) | Deleted after the period |
| Privacy-request records | Kept as proof of handling | Reviewed yearly |

Deletion removes data from the live database and private storage; copies in backups expire with the backup cycle. Legal holds override deletion and are recorded.
